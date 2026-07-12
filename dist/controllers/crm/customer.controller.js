"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerController = void 0;
const customer_repository_1 = require("../../repositories/crm/customer.repository");
const timeline_service_1 = require("../../services/crm/timeline.service");
const prisma_1 = require("../../lib/prisma");
const zod_1 = require("zod");
const occasion_service_1 = require("../../services/crm/occasion.service");
const occasionService = new occasion_service_1.OccasionService();
const customerRepository = new customer_repository_1.CustomerRepository();
const CustomerUpdateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Name is required').max(100).optional(),
    email: zod_1.z.string().email('Invalid email address').or(zod_1.z.literal('')).nullable().optional(),
    phone: zod_1.z.string().max(15).optional(),
    metadataJson: zod_1.z.any().optional(),
});
class CustomerController {
    // Fetch all customers for a Brand with pagination/filters
    getCustomers(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const user = req.user;
                if (!user) {
                    res.status(401).json({ error: 'Unauthorized' });
                    return;
                }
                // 1. Get Brand of the owner's restaurants
                const ownerRecord = yield prisma_1.prisma.user.findUnique({
                    where: { id: user.id },
                    include: {
                        restaurants: {
                            select: { brandId: true }
                        }
                    }
                });
                const brandId = (_b = (_a = ownerRecord === null || ownerRecord === void 0 ? void 0 : ownerRecord.restaurants) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.brandId;
                if (!brandId) {
                    res.status(400).json({ error: 'No brand context found for this account' });
                    return;
                }
                // Extract filter parameters
                const search = req.query['search'];
                const restaurantId = req.query['restaurantId'];
                const limit = req.query['limit'] ? parseInt(req.query['limit'], 10) : 20;
                const offset = req.query['offset'] ? parseInt(req.query['offset'], 10) : 0;
                const sortBy = req.query['sortBy'];
                const sortOrder = req.query['sortOrder'];
                const customers = yield customerRepository.findMany(brandId, {
                    search,
                    restaurantId,
                    limit,
                    offset,
                    sortBy,
                    sortOrder,
                });
                const total = yield customerRepository.count(brandId, {
                    search,
                    restaurantId,
                });
                res.status(200).json({ customers, total });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Fetch individual customer profile metrics & notes
    getCustomerById(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const user = req.user;
                const customerId = req.params['id'];
                if (!user || !customerId) {
                    res.status(400).json({ error: 'Invalid request parameters' });
                    return;
                }
                const ownerRecord = yield prisma_1.prisma.user.findUnique({
                    where: { id: user.id },
                    include: {
                        restaurants: {
                            select: { brandId: true }
                        }
                    }
                });
                const brandId = (_b = (_a = ownerRecord === null || ownerRecord === void 0 ? void 0 : ownerRecord.restaurants) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.brandId;
                if (!brandId) {
                    res.status(400).json({ error: 'No brand context found' });
                    return;
                }
                const customer = yield customerRepository.findById(customerId, brandId);
                if (!customer) {
                    res.status(404).json({ error: 'Customer not found' });
                    return;
                }
                res.status(200).json({ customer });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Update customer fields
    updateCustomer(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const user = req.user;
                const customerId = req.params['id'];
                if (!user || !customerId) {
                    res.status(400).json({ error: 'Invalid request parameters' });
                    return;
                }
                const validationResult = CustomerUpdateSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                const ownerRecord = yield prisma_1.prisma.user.findUnique({
                    where: { id: user.id },
                    include: {
                        restaurants: {
                            select: { brandId: true }
                        }
                    }
                });
                const brandId = (_b = (_a = ownerRecord === null || ownerRecord === void 0 ? void 0 : ownerRecord.restaurants) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.brandId;
                if (!brandId) {
                    res.status(400).json({ error: 'No brand context found' });
                    return;
                }
                // Sanitize null values
                const updateData = {};
                if (validationResult.data.name !== undefined)
                    updateData.name = validationResult.data.name;
                if (validationResult.data.phone !== undefined)
                    updateData.phone = validationResult.data.phone;
                if (validationResult.data.metadataJson !== undefined)
                    updateData.metadataJson = validationResult.data.metadataJson;
                if (validationResult.data.email !== undefined) {
                    updateData.email = validationResult.data.email === '' ? null : validationResult.data.email;
                }
                const updated = yield customerRepository.update(customerId, brandId, updateData);
                res.status(200).json({ message: 'Customer updated successfully', customer: updated });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Fetch customer timeline
    getCustomerTimeline(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const user = req.user;
                const customerId = req.params['id'];
                if (!user || !customerId) {
                    res.status(400).json({ error: 'Invalid request parameters' });
                    return;
                }
                const ownerRecord = yield prisma_1.prisma.user.findUnique({
                    where: { id: user.id },
                    include: {
                        restaurants: {
                            select: { brandId: true }
                        }
                    }
                });
                const brandId = (_b = (_a = ownerRecord === null || ownerRecord === void 0 ? void 0 : ownerRecord.restaurants) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.brandId;
                if (!brandId) {
                    res.status(400).json({ error: 'No brand context found' });
                    return;
                }
                const timelineService = new timeline_service_1.TimelineService();
                const timeline = yield timelineService.getCustomerTimeline(customerId, brandId);
                res.status(200).json({ timeline });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Create customer note
    createCustomerNote(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const user = req.user;
                const customerId = req.params['id'];
                const { noteText } = req.body;
                if (!user || !customerId || !noteText || noteText.trim() === '') {
                    res.status(400).json({ error: 'Invalid request parameters' });
                    return;
                }
                // Check brand mapping
                const ownerRecord = yield prisma_1.prisma.user.findUnique({
                    where: { id: user.id },
                    include: {
                        restaurants: {
                            select: { brandId: true }
                        }
                    }
                });
                const brandId = (_b = (_a = ownerRecord === null || ownerRecord === void 0 ? void 0 : ownerRecord.restaurants) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.brandId;
                if (!brandId) {
                    res.status(400).json({ error: 'No brand context found' });
                    return;
                }
                // Check customer belongs to brand
                const customer = yield prisma_1.prisma.customer.findFirst({
                    where: { id: customerId, brandId },
                });
                if (!customer) {
                    res.status(404).json({ error: 'Customer not found or unauthorized' });
                    return;
                }
                // Create Note
                const note = yield prisma_1.prisma.customerNote.create({
                    data: {
                        customerId,
                        userId: user.id,
                        noteText: noteText.trim(),
                        isSystem: false,
                    },
                    include: {
                        user: {
                            select: { name: true }
                        }
                    }
                });
                res.status(201).json({ message: 'Note added successfully', note });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Fetch upcoming birthdays/anniversaries (next 30 days)
    getUpcomingOccasions(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const user = req.user;
                if (!user) {
                    res.status(401).json({ error: 'Unauthorized' });
                    return;
                }
                const ownerRecord = yield prisma_1.prisma.user.findUnique({
                    where: { id: user.id },
                    include: { restaurants: { select: { brandId: true } } }
                });
                const brandId = (_b = (_a = ownerRecord === null || ownerRecord === void 0 ? void 0 : ownerRecord.restaurants) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.brandId;
                if (!brandId) {
                    res.status(400).json({ error: 'No brand context found' });
                    return;
                }
                const upcoming = yield occasionService.getUpcomingOccasions(brandId);
                res.status(200).json({ upcoming });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
}
exports.CustomerController = CustomerController;
//# sourceMappingURL=customer.controller.js.map