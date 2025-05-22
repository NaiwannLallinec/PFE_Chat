import { Routes } from '@angular/router';
import { TchatComponent } from './components/tchat/tchat.component';
import { LoginComponent } from './components/login/login.component';
import { VisuelComponent } from './components/visuel/visuel.component';

export const routes: Routes = [
    { path: 'login', component: LoginComponent },
    { path: 'register', component: LoginComponent, data: { mode: 'register' } },

    { path: 'chat', component: TchatComponent },
    { path: 'test', component: VisuelComponent },
    
    { path: '**', redirectTo: 'login' }
];