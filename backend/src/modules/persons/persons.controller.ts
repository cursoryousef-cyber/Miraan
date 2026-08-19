import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PersonsService } from './persons.service';
import { CreatePersonDto, UpdatePersonDto } from './dto/person.dto';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { JwtAuthGuard, PermissionsGuard } from '../../common/guards';
import { IAuthenticatedUser } from '../../common/interfaces';

@ApiTags('Persons (إدارة الأشخاص والهويات)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('persons')
export class PersonsController {
  constructor(private personsService: PersonsService) {}

  @Get()
  @ApiOperation({ summary: 'قائمة الأشخاص والهويات في النظام' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @RequirePermissions('view_users')
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('search') search?: string,
  ) {
    return this.personsService.findAll(+page, +limit, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل شخص محدد والحسابات والملفات المرتبطة به' })
  @RequirePermissions('view_users')
  async findOne(@Param('id') id: string) {
    return this.personsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'إنشاء سجل شخص جديد (هوية مستقلة)' })
  @RequirePermissions('manage_users')
  async create(
    @Body() dto: CreatePersonDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.personsService.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'تحديث بيانات شخص' })
  @RequirePermissions('manage_users')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePersonDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.personsService.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'حذف شخص (Soft Delete)' })
  @RequirePermissions('manage_users')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.personsService.softDelete(id, user);
  }
}
