"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const menuItem_controller_1 = require("../controllers/menuItem.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
const menuItemController = new menuItem_controller_1.MenuItemController();
// All menu item routes require authentication
router.use(auth_middleware_1.authenticate);
router.get('/', (req, res) => menuItemController.getMenuItems(req, res));
router.get('/:id', (req, res) => menuItemController.getMenuItemById(req, res));
router.post('/', (req, res) => menuItemController.createMenuItem(req, res));
router.patch('/:id', (req, res) => menuItemController.updateMenuItem(req, res));
router.delete('/:id', (req, res) => menuItemController.deleteMenuItem(req, res));
exports.default = router;
//# sourceMappingURL=menuItem.routes.js.map