export declare class ProfilerService {
    /**
     * Links or creates a customer profile during order checkout under the restaurant/brand context.
     * If a customer exists with this phone number under the brand, returns their customer ID.
     * If not, creates a new Customer and a CustomerRestaurantProfile, then returns the ID.
     */
    linkOrCreateCustomer(restaurantId: string, phone: string, name: string, email?: string): Promise<string>;
}
//# sourceMappingURL=profiler.service.d.ts.map