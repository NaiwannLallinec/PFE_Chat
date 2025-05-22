// login.component.ts
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { jwtDecode } from 'jwt-decode';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent implements OnInit {
  isLoginMode = true;          // true = connexion, false = inscription
  form!: FormGroup;
  errorMsg = '';
  message = '';
  messageType: 'success' | 'error' | '' = ''; 

  constructor(
    private fb: FormBuilder,
    private api: ApiService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.buildForm();
  }

  /** Construit / reconstruit le form selon le mode */
  private buildForm(): void {
    this.form = this.fb.group({
      username: ['', Validators.required],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: [''],
      streamer: [false],                       // ← nouveau champ
    });

    this.toggleValidators();
  }

  /** Active / désactive le validateur confirmPassword */
  private toggleValidators(): void {
    const confirm = this.form.get('confirmPassword')!;
    if (this.isLoginMode) {
      confirm.clearValidators();
    } else {
      confirm.setValidators([Validators.required]);
    }
    confirm.updateValueAndValidity();
  }

  switchMode(): void {
    this.isLoginMode = !this.isLoginMode;
    this.toggleValidators();
    this.errorMsg = '';
    // Réinitialise la case si on repasse en mode login
    if (this.isLoginMode) {
      this.form.patchValue({ streamer: false });
    }
  }

  onSubmit(): void {
    if (this.form.invalid) return;

    const { username, password, confirmPassword, streamer } = this.form.value;

    /* ---------- LOGIN ---------- */
    if (this.isLoginMode) {
      this.api.login({ username, password }).subscribe({
        next: (tok) => {
          localStorage.setItem('token', tok.access_token);
          sessionStorage.setItem('user_id', tok.user_id.toString());
          if (tok.is_viewer) {
            this.router.navigateByUrl('/home-viewer');
          } else {
            this.router.navigateByUrl('/setup-streamer');
          }
        },          
        error: () => (this.errorMsg = 'Identifiants incorrects'),
      });
      return;
    }

    /* ---------- REGISTER ---------- */
    if (password !== confirmPassword) {
      this.errorMsg = 'Les mots de passe ne correspondent pas';
      return;
    }

    this.api.register({ username, password, streamer }).subscribe({
      next: () => {
        this.isLoginMode = true;      // repasse en mode login
        this.toggleValidators();
        this.form.reset({ username, password: '' });
        this.message= 'Inscription réussie ! Connectez-vous 😉';
        this.messageType = 'success';
      },
      error: (err) => {
        this.errorMsg =
          err.status === 409
            ? 'Nom d’utilisateur déjà pris'
            : 'Erreur serveur';
      },
    });
  }
}