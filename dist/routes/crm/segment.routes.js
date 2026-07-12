"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const segment_controller_1 = require("../../controllers/crm/segment.controller");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const segmentController = new segment_controller_1.SegmentController();
router.use(auth_middleware_1.authenticate);
router.use((0, auth_middleware_1.requireRoles)([client_1.UserRole.RESTAURANT_OWNER, client_1.UserRole.SUPER_ADMIN]));
router.get('/', (req, res) => segmentController.getSegments(req, res));
router.post('/', (req, res) => segmentController.createSegment(req, res));
router.get('/rfm', (req, res) => segmentController.getRFMScores(req, res));
router.delete('/:id', (req, res) => segmentController.deleteSegment(req, res));
router.get('/:id/members', (req, res) => segmentController.getSegmentMembers(req, res));
router.post('/:id/retrace', (req, res) => segmentController.retraceSegment(req, res));
exports.default = router;
//# sourceMappingURL=segment.routes.js.map