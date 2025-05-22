import { Routes } from '@angular/router';
import { TchatComponent } from './components/tchat/tchat.component';
import { LoginComponent } from './components/login/login.component';
import { VisuelComponent } from './components/visuel/visuel.component';
import { HomeViewerComponent } from './components/home-viewer/home-viewer.component';

export const routes: Routes = [
    { path: '', component: LoginComponent },
    { path: 'chat', component: TchatComponent },
    { path: 'login', component: LoginComponent },
    { path: 'test', component: VisuelComponent },
    { path: 'home', component: HomeViewerComponent },
    { path: '**', redirectTo: '' }
];