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
require("dotenv/config");
const prisma_1 = require("../lib/prisma");
const client_1 = require("@prisma/client");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const email = process.argv[2];
        if (!email) {
            console.error('Please specify an email address. Example: npx ts-node src/scripts/promote-admin.ts email@example.com');
            process.exit(1);
        }
        try {
            const user = yield prisma_1.prisma.user.findUnique({
                where: { email }
            });
            if (!user) {
                console.error(`User with email "${email}" not found.`);
                process.exit(1);
            }
            yield prisma_1.prisma.user.update({
                where: { id: user.id },
                data: { role: client_1.UserRole.SUPER_ADMIN }
            });
            console.log(`Successfully promoted "${email}" to SUPER_ADMIN!`);
        }
        catch (error) {
            console.error('Failed to promote user:', error.message);
        }
        finally {
            process.exit(0);
        }
    });
}
run();
//# sourceMappingURL=promote-admin.js.map