import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PermitsController } from './permits.controller';
import { Permit } from '../domain/entities';
import { MondayIntegrationService } from '../integration/monday-integration.service';
import { createMockRepository } from '../../test/unit/mocks/repository.mock';
import { createTestPermit } from '../../test/unit/fixtures/entities';

describe('PermitsController', () => {
    let controller: PermitsController;
    let permitRepo: Repository<Permit>;
    let mondayService: MondayIntegrationService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [PermitsController],
            providers: [
                {
                    provide: getRepositoryToken(Permit),
                    useValue: createMockRepository<Permit>(),
                },
                {
                    provide: MondayIntegrationService,
                    useValue: {
                        pushPermitToMonday: jest.fn(),
                        updatePermitOnMonday: jest.fn(),
                        deletePermitFromMonday: jest.fn(),
                    },
                },
            ],
        }).compile();

        controller = module.get<PermitsController>(PermitsController);
        permitRepo = module.get(getRepositoryToken(Permit));
        mondayService = module.get<MondayIntegrationService>(MondayIntegrationService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('findAll', () => {
        it('should return all permits when no filters', async () => {
            // Arrange
            const permits = [
                createTestPermit({ vrm: 'ABC123' }),
                createTestPermit({ vrm: 'XYZ789' }),
            ];
            jest.spyOn(permitRepo, 'find').mockResolvedValue(permits);

            // Act
            const result = await controller.findAll();

            // Assert
            expect(result).toEqual(permits);
            expect(permitRepo.find).toHaveBeenCalledWith({
                where: {},
                order: { createdAt: 'DESC' },
            });
        });

        it('should filter by siteId when provided', async () => {
            // Arrange
            const permits = [createTestPermit({ vrm: 'ABC123', siteId: 'SITE01' })];
            jest.spyOn(permitRepo, 'find').mockResolvedValue(permits);

            // Act
            const result = await controller.findAll('SITE01');

            // Assert
            expect(result).toEqual(permits);
            expect(permitRepo.find).toHaveBeenCalledWith({
                where: { siteId: 'SITE01' },
                order: { createdAt: 'DESC' },
            });
        });

        it('should filter by VRM when provided', async () => {
            // Arrange
            const permits = [createTestPermit({ vrm: 'ABC123' })];
            jest.spyOn(permitRepo, 'find').mockResolvedValue(permits);

            // Act
            const result = await controller.findAll(undefined, 'abc 123');

            // Assert
            expect(result).toEqual(permits);
            expect(permitRepo.find).toHaveBeenCalledWith({
                where: { vrm: 'ABC123' },
                order: { createdAt: 'DESC' },
            });
        });
    });

    describe('create', () => {
        it('should create permit and push to Monday for WHITELIST', async () => {
            // Arrange
            const permitData = {
                vrm: 'new permit',
                siteId: 'SITE01',
                type: 'WHITELIST',
                startDate: '2026-01-27T10:00:00Z',
            };

            const savedPermit = createTestPermit({
                vrm: 'NEWPERMIT',
                siteId: 'SITE01',
                type: 'WHITELIST',
            });

            jest.spyOn(permitRepo, 'save').mockResolvedValue(savedPermit);
            jest.spyOn(mondayService, 'pushPermitToMonday').mockResolvedValue(undefined);

            // Act
            const result = await controller.create(permitData);

            // Assert
            expect(result).toEqual(savedPermit);
            expect(permitRepo.save).toHaveBeenCalled();
            expect(mondayService.pushPermitToMonday).toHaveBeenCalledWith(savedPermit);
        });

        it('should create permit without Monday sync for non-WHITELIST', async () => {
            // Arrange
            const permitData = {
                vrm: 'staff permit',
                type: 'STAFF',
            };

            const savedPermit = createTestPermit({
                vrm: 'STAFFPERMIT',
                type: 'STAFF',
            });

            jest.spyOn(permitRepo, 'save').mockResolvedValue(savedPermit);

            // Act
            const result = await controller.create(permitData);

            // Assert
            expect(result).toEqual(savedPermit);
            expect(mondayService.pushPermitToMonday).not.toHaveBeenCalled();
        });

        it('should normalize VRM to uppercase', async () => {
            // Arrange
            const permitData = {
                vrm: 'abc 123 def',
                type: 'WHITELIST',
            };

            const savedPermit = createTestPermit({ vrm: 'ABC123DEF' });
            jest.spyOn(permitRepo, 'save').mockResolvedValue(savedPermit);

            // Act
            await controller.create(permitData);

            // Assert
            expect(permitRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    vrm: 'ABC123DEF',
                })
            );
        });

        it('should handle null siteId for global permits', async () => {
            // Arrange
            const permitData = {
                vrm: 'GLOBAL01',
                type: 'WHITELIST',
            };

            const savedPermit = createTestPermit({
                vrm: 'GLOBAL01',
                siteId: null,
            });

            jest.spyOn(permitRepo, 'save').mockResolvedValue(savedPermit);

            // Act
            const result = await controller.create(permitData);

            // Assert
            expect(result.siteId).toBeNull();
        });
    });

    describe('update', () => {
        it('should update permit and sync to Monday for WHITELIST', async () => {
            // Arrange
            const permitId = 'permit-id';
            const updateData = { active: false };
            const updatedPermit = createTestPermit({
                id: permitId,
                type: 'WHITELIST',
                active: false,
            });

            jest.spyOn(permitRepo, 'update').mockResolvedValue({ affected: 1 } as any);
            jest.spyOn(permitRepo, 'findOne').mockResolvedValue(updatedPermit);
            jest.spyOn(mondayService, 'updatePermitOnMonday').mockResolvedValue(undefined);

            // Act
            const result = await controller.update(permitId, updateData);

            // Assert
            expect(result).toEqual(updatedPermit);
            expect(permitRepo.update).toHaveBeenCalledWith(permitId, updateData);
            expect(mondayService.updatePermitOnMonday).toHaveBeenCalledWith(updatedPermit);
        });

        it('should normalize VRM if provided in update', async () => {
            // Arrange
            const permitId = 'permit-id';
            const updateData = { vrm: 'new vrm' };
            const updatedPermit = createTestPermit({ id: permitId });

            jest.spyOn(permitRepo, 'update').mockResolvedValue({ affected: 1 } as any);
            jest.spyOn(permitRepo, 'findOne').mockResolvedValue(updatedPermit);

            // Act
            await controller.update(permitId, updateData);

            // Assert
            expect(permitRepo.update).toHaveBeenCalledWith(permitId, { vrm: 'NEWVRM' });
        });
    });

    describe('remove', () => {
        it('should delete permit and remove from Monday if mondayItemId exists', async () => {
            // Arrange
            const permitId = 'permit-id';
            const permit = createTestPermit({
                id: permitId,
                type: 'WHITELIST',
                mondayItemId: 'monday-123',
            });

            jest.spyOn(permitRepo, 'findOne').mockResolvedValue(permit);
            jest.spyOn(permitRepo, 'delete').mockResolvedValue({ affected: 1 } as any);
            jest.spyOn(mondayService, 'deletePermitFromMonday').mockResolvedValue(undefined);

            // Act
            const result = await controller.remove(permitId);

            // Assert
            expect(result).toEqual({ deleted: true });
            expect(mondayService.deletePermitFromMonday).toHaveBeenCalledWith('monday-123');
            expect(permitRepo.delete).toHaveBeenCalledWith(permitId);
        });

        it('should delete permit without Monday sync if not WHITELIST', async () => {
            // Arrange
            const permitId = 'permit-id';
            const permit = createTestPermit({
                id: permitId,
                type: 'STAFF',
                mondayItemId: 'monday-123',
            });

            jest.spyOn(permitRepo, 'findOne').mockResolvedValue(permit);
            jest.spyOn(permitRepo, 'delete').mockResolvedValue({ affected: 1 } as any);

            // Act
            const result = await controller.remove(permitId);

            // Assert
            expect(result).toEqual({ deleted: true });
            expect(mondayService.deletePermitFromMonday).not.toHaveBeenCalled();
        });

        it('should delete permit without Monday sync if no mondayItemId', async () => {
            // Arrange
            const permitId = 'permit-id';
            const permit = createTestPermit({
                id: permitId,
                type: 'WHITELIST',
                mondayItemId: null as any,
            });

            jest.spyOn(permitRepo, 'findOne').mockResolvedValue(permit);
            jest.spyOn(permitRepo, 'delete').mockResolvedValue({ affected: 1 } as any);

            // Act
            const result = await controller.remove(permitId);

            // Assert
            expect(result).toEqual({ deleted: true });
            expect(mondayService.deletePermitFromMonday).not.toHaveBeenCalled();
        });
    });
});
