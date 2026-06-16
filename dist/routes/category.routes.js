"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const category_controller_1 = require("../controllers/category.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
const categoryController = new category_controller_1.CategoryController();
// All category routes require authentication
router.use(auth_middleware_1.authenticate);
router.get('/', (req, res) => categoryController.getCategories(req, res));
router.post('/', (req, res) => categoryController.createCategory(req, res));
router.patch('/:id', (req, res) => categoryController.updateCategory(req, res));
router.delete('/:id', (req, res) => categoryController.deleteCategory(req, res));
exports.default = router;
//# sourceMappingURL=category.routes.js.map