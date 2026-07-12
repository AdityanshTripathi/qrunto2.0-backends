import { Customer } from '@prisma/client';
export declare class CustomerRepository {
    findById(id: string, brandId: string): Promise<Customer | null>;
    findByPhone(phone: string, brandId: string): Promise<Customer | null>;
    create(data: {
        brandId: string;
        name: string;
        phone: string;
        email?: string | null;
        acquisitionSource?: string;
        metadataJson?: any;
    }): Promise<Customer>;
    update(id: string, brandId: string, data: Partial<Omit<Customer, 'id' | 'brandId' | 'createdAt' | 'updatedAt'>>): Promise<Customer>;
    findMany(brandId: string, filters?: {
        search?: string;
        restaurantId?: string;
        limit?: number;
        offset?: number;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
    }): Promise<({
        [x: string]: {
            id: string;
            restaurantId: string;
            customerId: string;
            totalSpend: number;
            totalOrders: number;
            aov: number;
            ltv: number;
            firstVisit: Date;
            lastVisit: Date;
            visitFrequency: number;
            repeatStatus: string;
            churnProbability: number;
            predictedLtv: number;
            healthScore: number;
            engagementScore: number;
            loyaltyTierId: string | null;
        }[] | {
            comments: string | null;
            id: string;
            createdAt: Date;
            orderId: string;
            customerId: string;
            rating: number;
        }[] | {
            id: string;
            restaurantId: string;
            createdAt: Date;
            updatedAt: Date;
            status: import("@prisma/client").$Enums.OrderStatus;
            notes: string | null;
            customerId: string | null;
            customerName: string | null;
            customerPhone: string | null;
            tableId: string;
            orderNumber: string;
            subtotal: number;
            taxAmount: number;
            totalAmount: number;
            kotNumber: string | null;
            invoiceNumber: string | null;
        }[] | ({
            id: string;
            restaurantId: string;
            createdAt: Date;
            updatedAt: Date;
            status: import("@prisma/client").$Enums.OrderStatus;
            notes: string | null;
            customerId: string | null;
            customerName: string | null;
            customerPhone: string | null;
            tableId: string;
            orderNumber: string;
            subtotal: number;
            taxAmount: number;
            totalAmount: number;
            kotNumber: string | null;
            invoiceNumber: string | null;
        } | {
            id: string;
            restaurantId: string;
            createdAt: Date;
            updatedAt: Date;
            status: import("@prisma/client").$Enums.OrderStatus;
            notes: string | null;
            customerId: string | null;
            customerName: string | null;
            customerPhone: string | null;
            tableId: string;
            orderNumber: string;
            subtotal: number;
            taxAmount: number;
            totalAmount: number;
            kotNumber: string | null;
            invoiceNumber: string | null;
        })[] | ({
            id: string;
            restaurantId: string;
            customerId: string;
            totalSpend: number;
            totalOrders: number;
            aov: number;
            ltv: number;
            firstVisit: Date;
            lastVisit: Date;
            visitFrequency: number;
            repeatStatus: string;
            churnProbability: number;
            predictedLtv: number;
            healthScore: number;
            engagementScore: number;
            loyaltyTierId: string | null;
        } | {
            id: string;
            restaurantId: string;
            customerId: string;
            totalSpend: number;
            totalOrders: number;
            aov: number;
            ltv: number;
            firstVisit: Date;
            lastVisit: Date;
            visitFrequency: number;
            repeatStatus: string;
            churnProbability: number;
            predictedLtv: number;
            healthScore: number;
            engagementScore: number;
            loyaltyTierId: string | null;
        })[] | ({
            id: string;
            createdAt: Date;
            redeemedAt: Date | null;
            orderId: string | null;
            customerId: string;
            couponId: string;
            isRedeemed: boolean;
        } | {
            id: string;
            createdAt: Date;
            redeemedAt: Date | null;
            orderId: string | null;
            customerId: string;
            couponId: string;
            isRedeemed: boolean;
        })[] | ({
            id: string;
            createdAt: Date;
            customerId: string;
            userId: string;
            noteText: string;
            isSystem: boolean;
        } | {
            id: string;
            createdAt: Date;
            customerId: string;
            userId: string;
            noteText: string;
            isSystem: boolean;
        })[] | ({
            id: string;
            createdAt: Date;
            updatedAt: Date;
            brandId: string;
            status: import("@prisma/client").$Enums.TicketStatus;
            description: string;
            customerId: string;
            subject: string;
            feedbackId: string | null;
            assignedUserId: string | null;
        } | {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            brandId: string;
            status: import("@prisma/client").$Enums.TicketStatus;
            description: string;
            customerId: string;
            subject: string;
            feedbackId: string | null;
            assignedUserId: string | null;
        })[] | ({
            comments: string | null;
            id: string;
            createdAt: Date;
            orderId: string;
            customerId: string;
            rating: number;
        } | {
            comments: string | null;
            id: string;
            createdAt: Date;
            orderId: string;
            customerId: string;
            rating: number;
        })[] | ({
            id: string;
            createdAt: Date;
            customerId: string;
            segmentId: string;
        } | {
            id: string;
            createdAt: Date;
            customerId: string;
            segmentId: string;
        })[] | ({
            id: string;
            createdAt: Date;
            status: import("@prisma/client").$Enums.CampaignLogStatus;
            customerId: string;
            campaignId: string;
            errorDetails: string | null;
        } | {
            id: string;
            createdAt: Date;
            status: import("@prisma/client").$Enums.CampaignLogStatus;
            customerId: string;
            campaignId: string;
            errorDetails: string | null;
        })[] | {
            id: string;
            createdAt: Date;
            redeemedAt: Date | null;
            orderId: string | null;
            customerId: string;
            couponId: string;
            isRedeemed: boolean;
        }[] | {
            id: string;
            createdAt: Date;
            customerId: string;
            userId: string;
            noteText: string;
            isSystem: boolean;
        }[] | {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            brandId: string;
            status: import("@prisma/client").$Enums.TicketStatus;
            description: string;
            customerId: string;
            subject: string;
            feedbackId: string | null;
            assignedUserId: string | null;
        }[] | {
            id: string;
            createdAt: Date;
            customerId: string;
            segmentId: string;
        }[] | {
            id: string;
            createdAt: Date;
            status: import("@prisma/client").$Enums.CampaignLogStatus;
            customerId: string;
            campaignId: string;
            errorDetails: string | null;
        }[];
        [x: number]: never;
        [x: symbol]: never;
    } & {
        name: string;
        id: string;
        email: string | null;
        phone: string;
        createdAt: Date;
        updatedAt: Date;
        brandId: string;
        acquisitionSource: string;
        metadataJson: import("@prisma/client/runtime/client").JsonValue | null;
        aiSummary: string | null;
    })[]>;
    count(brandId: string, filters?: {
        search?: string;
        restaurantId?: string;
    }): Promise<number>;
}
//# sourceMappingURL=customer.repository.d.ts.map