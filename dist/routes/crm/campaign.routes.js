"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const campaign_controller_1 = require("../../controllers/crm/campaign.controller");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const campaignController = new campaign_controller_1.CampaignController();
router.use(auth_middleware_1.authenticate);
router.use((0, auth_middleware_1.requireRoles)([client_1.UserRole.RESTAURANT_OWNER, client_1.UserRole.SUPER_ADMIN]));
router.get('/', (req, res) => campaignController.getCampaigns(req, res));
router.post('/', (req, res) => campaignController.createCampaign(req, res));
router.get('/stats', (req, res) => campaignController.getCampaignStats(req, res));
router.delete('/:id', (req, res) => campaignController.deleteCampaign(req, res));
router.get('/:id/logs', (req, res) => campaignController.getCampaignLogs(req, res));
exports.default = router;
//# sourceMappingURL=campaign.routes.js.map