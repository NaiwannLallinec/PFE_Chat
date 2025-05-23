import { Routes } from '@angular/router';
import { TchatComponent } from './components/tchat/tchat.component';
import { LoginComponent } from './components/login/login.component';
import { VisuelComponent } from './components/visuel/visuel.component';
import { SetupStreamerComponent } from './components/setup-streamer/setup-streamer.component';
import { HomeViewerComponent } from './components/home-viewer/home-viewer.component';
import { AuthGuard } from './guards/auth.guard';
import { AdminGuard } from './guards/admin.guard';
import { Auth2Guard } from './guards/auth2.guard';

export const routes: Routes = [
    { path: 'login', component: LoginComponent, canActivate: [Auth2Guard] },
    { path: 'register', component: LoginComponent, data: { mode: 'register' } },
    { path: 'setup-streamer',component: SetupStreamerComponent, canActivate:[AuthGuard, AdminGuard]},
    { path: 'home-viewer', component: HomeViewerComponent, canActivate:[AuthGuard] },
    { path: 'tchat', component: TchatComponent, canActivate:[AuthGuard] },
    { path: 'test', component: VisuelComponent },
    { path: '**', redirectTo: 'home-viewer' }
];