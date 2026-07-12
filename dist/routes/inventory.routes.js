"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const raw_material_controller_1 = require("../controllers/inventory/raw-material.controller");
const supplier_controller_1 = require("../controllers/inventory/supplier.controller");
const purchase_controller_1 = require("../controllers/inventory/purchase.controller");
const wastage_controller_1 = require("../controllers/inventory/wastage.controller");
const recipe_controller_1 = require("../controllers/inventory/recipe.controller");
const audit_controller_1 = require("../controllers/inventory/audit.controller");
const transfer_controller_1 = require("../controllers/inventory/transfer.controller");
const report_controller_1 = require("../controllers/inventory/report.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
const rawMaterialController = new raw_material_controller_1.RawMaterialController();
const supplierController = new supplier_controller_1.SupplierController();
const purchaseController = new purchase_controller_1.PurchaseController();
const wastageController = new wastage_controller_1.WastageController();
const recipeController = new recipe_controller_1.RecipeController();
const auditController = new audit_controller_1.AuditController();
const transferController = new transfer_controller_1.TransferController();
const reportController = new report_controller_1.ReportController();
// All inventory routes require authentication
router.use(auth_middleware_1.authenticate);
// Raw Materials Routes
router.get('/raw-materials', (req, res) => rawMaterialController.getRawMaterials(req, res));
router.post('/raw-materials', (req, res) => rawMaterialController.createRawMaterial(req, res));
router.get('/raw-materials/:id', (req, res) => rawMaterialController.getRawMaterialById(req, res));
router.put('/raw-materials/:id', (req, res) => rawMaterialController.updateRawMaterial(req, res));
router.delete('/raw-materials/:id', (req, res) => rawMaterialController.deleteRawMaterial(req, res));
router.post('/raw-materials/adjust', (req, res) => rawMaterialController.adjustStock(req, res));
// Suppliers Routes
router.get('/suppliers', (req, res) => supplierController.getSuppliers(req, res));
router.post('/suppliers', (req, res) => supplierController.createSupplier(req, res));
router.get('/suppliers/:id', (req, res) => supplierController.getSupplierById(req, res));
router.put('/suppliers/:id', (req, res) => supplierController.updateSupplier(req, res));
router.delete('/suppliers/:id', (req, res) => supplierController.deleteSupplier(req, res));
// Purchase Orders Routes
router.get('/purchases', (req, res) => purchaseController.getPurchaseOrders(req, res));
router.post('/purchases', (req, res) => purchaseController.createPurchaseOrder(req, res));
router.get('/purchases/:id', (req, res) => purchaseController.getPurchaseOrderById(req, res));
router.put('/purchases/:id', (req, res) => purchaseController.updatePurchaseOrder(req, res));
router.post('/purchases/:id/receive', (req, res) => purchaseController.receivePurchaseOrder(req, res));
// Wastage Routes
router.get('/wastage', (req, res) => wastageController.getWastageRecords(req, res));
router.post('/wastage', (req, res) => wastageController.createWastageRecord(req, res));
// Recipe Routes
router.get('/recipes', (req, res) => recipeController.getRecipes(req, res));
router.get('/recipes/:menuItemId', (req, res) => recipeController.getRecipeByMenuItemId(req, res));
router.post('/recipes', (req, res) => recipeController.createRecipe(req, res));
router.put('/recipes/:id', (req, res) => recipeController.updateRecipe(req, res));
// Audits Routes
router.get('/audits', (req, res) => auditController.getAudits(req, res));
router.post('/audits', (req, res) => auditController.createAudit(req, res));
// Stock Transfers Routes
router.get('/transfers', (req, res) => transferController.getTransfers(req, res));
router.post('/transfers', (req, res) => transferController.createTransfer(req, res));
router.post('/transfers/:id/approve', (req, res) => transferController.approveTransfer(req, res));
router.post('/transfers/:id/reject', (req, res) => transferController.rejectTransfer(req, res));
// Reports Routes
router.get('/reports/dashboard-metrics', (req, res) => reportController.getDashboardMetrics(req, res));
router.get('/reports/analytics/consumption', (req, res) => reportController.getConsumptionAnalytics(req, res));
exports.default = router;
//# sourceMappingURL=inventory.routes.js.map