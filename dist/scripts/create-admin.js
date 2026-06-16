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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const prisma_1 = require("../lib/prisma");
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const email = 'shouyak530@gmail.com';
        const password = 'shourya';
        const name = 'Shourya';
        try {
            const passwordHash = yield bcrypt_1.default.hash(password, 10);
            const existingUser = yield prisma_1.prisma.user.findUnique({
                where: { email }
            });
            if (existingUser) {
                yield prisma_1.prisma.user.update({
                    where: { id: existingUser.id },
                    data: {
                        role: client_1.UserRole.SUPER_ADMIN,
                        password: passwordHash,
                        name
                    }
                });
                console.log(`Updated existing user "${email}" to SUPER_ADMIN with password "${password}"`);
            }
            else {
                yield prisma_1.prisma.user.create({
                    data: {
                        name,
                        email,
                        password: passwordHash,
                        role: client_1.UserRole.SUPER_ADMIN
                    }
                });
                console.log(`Created new SUPER_ADMIN user "${email}" with password "${password}"`);
            }
        }
        catch (error) {
            console.error('Failed to create/update admin user:', error.message);
        }
        finally {
            process.exit(0);
        }
    });
}
run();
//# sourceMappingURL=create-admin.js.map