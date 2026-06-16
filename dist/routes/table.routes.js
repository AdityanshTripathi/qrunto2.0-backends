"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const table_controller_1 = require("../controllers/table.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
const tableController = new table_controller_1.TableController();
router.use(auth_middleware_1.authenticate);
router.get('/', (req, res) => tableController.getTables(req, res));
router.post('/', (req, res) => tableController.createTable(req, res));
router.patch('/:id', (req, res) => tableController.updateTable(req, res));
router.delete('/:id', (req, res) => tableController.deleteTable(req, res));
exports.default = router;
//# sourceMappingURL=table.routes.js.map