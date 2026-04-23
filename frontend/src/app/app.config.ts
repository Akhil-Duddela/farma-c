import { ApplicationConfig, ErrorHandler, provideZoneChangeDetection } from '@angular/core';
import { createErrorHandler } from '@sentry/angular';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { environment } from '../environments/environment';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorToastInterceptor } from './core/interceptors/error-toast.interceptor';

const baseProviders = [
  provideZoneChangeDetection({ eventCoalescing: true }),
  provideRouter(routes),
  provideHttpClient(withInterceptors([authInterceptor, errorToastInterceptor])),
] as const;

const sentryErrorHandler = environment.sentryDsn?.length
  ? [{ provide: ErrorHandler, useValue: createErrorHandler({ showDialog: false }) }]
  : [];

export const appConfig: ApplicationConfig = {
  providers: [...baseProviders, ...sentryErrorHandler],
};
