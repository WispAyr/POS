import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
    @Get()
    getHello(): string {
        return 'Parking Operations System API is running. Access /api/stats for statistics.';
    }
}
