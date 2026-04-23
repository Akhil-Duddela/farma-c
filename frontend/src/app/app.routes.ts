import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { ShellComponent } from './pages/shell/shell.component';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { PostListComponent } from './pages/posts/post-list.component';
import { PostFormComponent } from './pages/posts/post-form.component';
import { CalendarComponent } from './pages/calendar/calendar.component';
import { LogsComponent } from './pages/logs/logs.component';
import { SettingsComponent } from './pages/settings/settings.component';
import { AnalyticsComponent } from './pages/analytics/analytics.component';
import { YoutubeOauthResultComponent } from './pages/youtube/youtube-oauth-result.component';
import { AiEnhancerComponent } from './components/ai-enhancer/ai-enhancer.component';
import { VerifyEmailComponent } from './pages/verify-email/verify-email.component';
import { OauthRedirectComponent } from './pages/oauth-redirect/oauth-redirect.component';
import { VerificationComponent } from './pages/verification/verification.component';
import { AdminVerificationsComponent } from './pages/admin/admin-verifications.component';
import { LeaderboardComponent } from './pages/leaderboard/leaderboard.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'verify-email', component: VerifyEmailComponent },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'oauth', component: OauthRedirectComponent },
      { path: 'posts', component: PostListComponent },
      { path: 'posts/new', component: PostFormComponent },
      { path: 'posts/:id/edit', component: PostFormComponent },
      { path: 'calendar', component: CalendarComponent },
      { path: 'logs', component: LogsComponent },
      { path: 'settings', component: SettingsComponent },
      { path: 'analytics', component: AnalyticsComponent },
      { path: 'leaderboard', component: LeaderboardComponent },
      { path: 'youtube/oauth-result', component: YoutubeOauthResultComponent },
      { path: 'ai', component: AiEnhancerComponent },
      { path: 'verification', component: VerificationComponent },
      {
        path: 'admin/verifications',
        component: AdminVerificationsComponent,
        canActivate: [adminGuard],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
