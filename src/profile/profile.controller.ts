import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/profile.dto';
import { CurrentUser, AuthUserPayload } from '../common/decorators/current-user.decorator';

@ApiTags('profile')
@ApiBearerAuth()
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  getProfile(@CurrentUser() user: AuthUserPayload) {
    return this.profileService.getProfile(user.id);
  }

  @Patch()
  updateProfile(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profileService.updateProfile(user.id, dto);
  }
}
