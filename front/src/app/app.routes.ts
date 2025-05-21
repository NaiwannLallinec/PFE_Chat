import { Routes } from '@angular/router';
import { TchatComponent } from './components/tchat/tchat.component';
import { LoginComponent } from './components/login/login.component';

export const routes: Routes = [
    { path: '', component: LoginComponent },
    { path: 'chat', component: TchatComponent },
    { path: 'login', component: LoginComponent },
    { path: '**', redirectTo: '' }
];