import { Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { PasscodeResetStatus } from '@prisma/client';

// Validation schemas
const SetPasscodeSchema = z.object({
  passcode: z.string().min(4, 'Passcode must be at least 4 characters').max(20, 'Passcode cannot exceed 20 characters'),
  oldPasscode: z.string().optional(),
});

const VerifyPasscodeSchema = z.object({
  passcode: z.string(),
});

export class PasscodeController {
  // ─── GET /api/settings/passcode/status ──────────────────────────────────────
  async getPasscodeStatus(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || !req.user.restaurantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const restaurantId = req.user.restaurantId;

      const settings = await prisma.restaurantSetting.findUnique({
        where: { restaurantId },
        select: {
          isPasscodeEnabled: true,
          passcode: true,
        },
      });

      // Fetch any pending or approved reset request
      const activeRequest = await prisma.passcodeResetRequest.findFirst({
        where: {
          restaurantId,
          status: {
            in: [PasscodeResetStatus.PENDING, PasscodeResetStatus.APPROVED],
          },
        },
        orderBy: { requestedAt: 'desc' },
      });

      res.status(200).json({
        isPasscodeEnabled: settings?.isPasscodeEnabled ?? false,
        hasPasscodeSet: !!settings?.passcode,
        activeRequest: activeRequest
          ? {
              id: activeRequest.id,
              status: activeRequest.status,
              requestedAt: activeRequest.requestedAt,
            }
          : null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // ─── POST /api/settings/passcode/set ────────────────────────────────────────
  async setPasscode(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || !req.user.restaurantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const restaurantId = req.user.restaurantId;

      const validation = SetPasscodeSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ errors: validation.error.flatten().fieldErrors });
        return;
      }

      const { passcode, oldPasscode } = validation.data;

      const settings = await prisma.restaurantSetting.findUnique({
        where: { restaurantId },
      });

      // Check if there is an approved reset request
      const approvedRequest = await prisma.passcodeResetRequest.findFirst({
        where: {
          restaurantId,
          status: PasscodeResetStatus.APPROVED,
        },
        orderBy: { requestedAt: 'desc' },
      });

      // If passcode is already set, and there's no approved reset request, verify old passcode
      if (settings?.passcode && !approvedRequest) {
        if (!oldPasscode) {
          res.status(400).json({ error: 'Current passcode is required to set a new one.' });
          return;
        }

        const isMatch = await bcrypt.compare(oldPasscode, settings.passcode);
        if (!isMatch) {
          res.status(400).json({ error: 'Current passcode is incorrect.' });
          return;
        }
      }

      // Hash the new passcode
      const hashedPasscode = await bcrypt.hash(passcode, 10);

      // Perform transaction to save new passcode and complete approved requests
      await prisma.$transaction(async (tx) => {
        // Save passcode and enable it by default
        await tx.restaurantSetting.upsert({
          where: { restaurantId },
          update: {
            passcode: hashedPasscode,
            isPasscodeEnabled: true,
          },
          create: {
            restaurantId,
            passcode: hashedPasscode,
            isPasscodeEnabled: true,
          },
        });

        // Mark approved request as completed if it existed
        if (approvedRequest) {
          await tx.passcodeResetRequest.update({
            where: { id: approvedRequest.id },
            data: {
              status: PasscodeResetStatus.COMPLETED,
              processedAt: new Date(),
            },
          });
        }
      });

      res.status(200).json({ message: 'Passcode updated and enabled successfully!' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // ─── POST /api/settings/passcode/toggle ──────────────────────────────────────
  async togglePasscode(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || !req.user.restaurantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const restaurantId = req.user.restaurantId;

      const { isPasscodeEnabled, passcode } = req.body;

      if (typeof isPasscodeEnabled !== 'boolean') {
        res.status(400).json({ error: 'isPasscodeEnabled boolean parameter required' });
        return;
      }

      const settings = await prisma.restaurantSetting.findUnique({
        where: { restaurantId },
      });

      if (!settings?.passcode) {
        res.status(400).json({ error: 'Passcode must be set before enabling lock.' });
        return;
      }

      // If disabling or enabling, require passcode verification
      if (!passcode) {
        res.status(400).json({ error: 'Passcode verification is required to toggle this setting.' });
        return;
      }

      const isMatch = await bcrypt.compare(passcode, settings.passcode);
      if (!isMatch) {
        res.status(400).json({ error: 'Incorrect passcode.' });
        return;
      }

      const updated = await prisma.restaurantSetting.update({
        where: { restaurantId },
        data: { isPasscodeEnabled },
      });

      res.status(200).json({
        message: `Passcode lock ${updated.isPasscodeEnabled ? 'enabled' : 'disabled'} successfully!`,
        isPasscodeEnabled: updated.isPasscodeEnabled,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // ─── POST /api/settings/passcode/verify ─────────────────────────────────────
  async verifyPasscode(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || !req.user.restaurantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const restaurantId = req.user.restaurantId;

      const validation = VerifyPasscodeSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ error: 'Passcode is required.' });
        return;
      }

      const { passcode } = validation.data;

      const settings = await prisma.restaurantSetting.findUnique({
        where: { restaurantId },
      });

      if (!settings?.passcode) {
        res.status(400).json({ error: 'Passcode is not set for this restaurant.' });
        return;
      }

      const isMatch = await bcrypt.compare(passcode, settings.passcode);
      if (!isMatch) {
        res.status(400).json({ error: 'Incorrect passcode.' });
        return;
      }

      res.status(200).json({ success: true, message: 'Passcode verified successfully!' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // ─── POST /api/settings/passcode/reset-request ──────────────────────────────
  async createResetRequest(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || !req.user.restaurantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const restaurantId = req.user.restaurantId;

      // Check if there is already an active pending request
      const existing = await prisma.passcodeResetRequest.findFirst({
        where: {
          restaurantId,
          status: PasscodeResetStatus.PENDING,
        },
      });

      if (existing) {
        res.status(400).json({
          error: 'A passcode reset request is already pending super admin approval.',
          request: existing,
        });
        return;
      }

      const newRequest = await prisma.passcodeResetRequest.create({
        data: {
          restaurantId,
          status: PasscodeResetStatus.PENDING,
        },
      });

      res.status(201).json({
        message: 'Passcode reset request submitted to super admin successfully.',
        request: newRequest,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
