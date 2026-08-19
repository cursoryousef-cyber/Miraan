import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Response } from 'express';
import { StorageService } from './storage.service';
import { CurrentUser } from '../../common/decorators';
import { JwtAuthGuard } from '../../common/guards';
import { IAuthenticatedUser } from '../../common/interfaces';
import {
  CAPABILITIES, CapabilityGuard, RequireCapability,
} from '../../common/authz';

@ApiTags('Storage (طبقة التخزين المجردة - Storage Provider)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, CapabilityGuard)
@Controller('files')
export class StorageController {
  constructor(private storageService: StorageService) {}

  // Uploading and retrieving files by id needs a stated reason to be in the
  // system at all; bare authentication let any account fetch any stored file.
  @Post('upload')
  @RequireCapability(
    CAPABILITIES.LOGBOOK_SUBMIT, CAPABILITIES.LOGBOOK_VIEW,
    CAPABILITIES.ORG_MEMBER_VIEW, CAPABILITIES.SELF_VIEW,
  )
  @ApiOperation({ summary: 'رفع ملف جديد عبر Storage Provider المجرد' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        category: { type: 'string', example: 'documents' },
        isPublic: { type: 'boolean', example: false },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('category') category = 'general',
    @Query('isPublic') isPublic = false,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.storageService.uploadFile(file, category, String(isPublic) === 'true', user);
  }

  @Get(':id/download')
  @RequireCapability(
    CAPABILITIES.LOGBOOK_VIEW, CAPABILITIES.ORG_MEMBER_VIEW, CAPABILITIES.SELF_VIEW,
  )
  @ApiOperation({ summary: 'تحميل ملف المباشر عبر Storage Key' })
  async downloadFile(@Param('id') id: string, @Res() res: Response) {
    const { storedFile, buffer } = await this.storageService.getFileDownload(id);
    res.setHeader('Content-Type', storedFile.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(storedFile.fileName)}"`);
    res.send(buffer);
  }

  @Get(':id/url')
  @RequireCapability(
    CAPABILITIES.LOGBOOK_VIEW, CAPABILITIES.ORG_MEMBER_VIEW, CAPABILITIES.SELF_VIEW,
  )
  @ApiOperation({ summary: 'الحصول على رابط موقّع مؤقت للملف' })
  async getSignedUrl(@Param('id') id: string) {
    return this.storageService.getSignedUrl(id);
  }
}
