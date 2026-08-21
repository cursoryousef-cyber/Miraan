import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class AdminChangeTraineePasswordDto {
  @ApiProperty({ description: 'كلمة المرور الجديدة — يجب أن تكون 8 أحرف على الأقل' })
  @IsString()
  @IsNotEmpty({ message: 'كلمة المرور الجديدة مطلوبة' })
  @MinLength(8, { message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
  password!: string;
}
