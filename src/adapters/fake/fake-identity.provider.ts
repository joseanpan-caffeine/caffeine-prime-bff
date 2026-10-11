import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { RegisterRequest, UpdateProfileRequest } from '../../contracts/api';
import { AppError } from '../../common/errors';
import { IdentityProfile, IdentityProvider } from '../../ports';
import { FakeAccount, FakeState } from './fake-state';

/** Máscara de CPF para exibição: ***.***.123-45 */
export function maskCpf(cpf?: string): string | undefined {
  if (!cpf) return undefined;
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return '***.***.***-**';
  return `***.***.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/**
 * Provedor de identidade em memória.
 * - Senha de todas as contas: `prime123`.
 * - Google/Apple: idToken no formato `fake:<email>` loga o e-mail indicado.
 * - Link mágico: o token é devolvido em `debugToken` (apenas neste adaptador).
 */
@Injectable()
export class FakeIdentityProvider implements IdentityProvider {
  constructor(private readonly state: FakeState) {}

  private toProfile(account: FakeAccount): IdentityProfile {
    return {
      id: account.customerId,
      email: account.email,
      firstName: account.firstName,
      lastName: account.lastName,
      cpf: maskCpf(account.cpf),
      phone: account.phone,
      ...(account.gender ? { gender: account.gender } : {}),
    };
  }

  async loginWithPassword(email: string, password: string): Promise<IdentityProfile> {
    const account = this.state.findAccountByEmail(email);
    if (!account || account.password !== password) {
      throw AppError.unauthorized('INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
    }
    return this.toProfile(account);
  }

  private socialLogin(token: string, fullName?: string): IdentityProfile {
    if (!token.startsWith('fake:')) {
      throw AppError.unauthorized('INVALID_ID_TOKEN', 'Token de login social inválido.');
    }
    const email = token.slice('fake:'.length).trim().toLowerCase();
    let account = this.state.findAccountByEmail(email);
    if (!account) {
      // Primeiro login social cria o cliente (equivalente ao Multipass criar o customer na Shopify).
      const [firstName = 'Cliente', ...rest] = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
      account = this.state.createAccount({
        email,
        password: randomBytes(8).toString('hex'),
        firstName,
        lastName: rest.join(' ') || 'Prime',
        cpf: '',
        phone: '',
      });
    }
    return this.toProfile(account);
  }

  async loginWithGoogleIdToken(idToken: string, fullName?: string): Promise<IdentityProfile> {
    return this.socialLogin(idToken, fullName);
  }

  async loginWithAppleIdentityToken(
    identityToken: string,
    fullName?: string,
  ): Promise<IdentityProfile> {
    return this.socialLogin(identityToken, fullName);
  }

  async sendMagicLink(email: string): Promise<{ debugToken?: string }> {
    const account = this.state.findAccountByEmail(email);
    // Mesmo sem conta respondemos como enviado (não revelar existência do e-mail).
    if (!account) return {};
    const token = `ml_${randomBytes(16).toString('hex')}`;
    this.state.magicLinks.set(token, {
      email: account.email,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    return { debugToken: token };
  }

  async exchangeMagicLink(token: string): Promise<IdentityProfile> {
    const entry = this.state.magicLinks.get(token);
    if (!entry || entry.expiresAt.getTime() < Date.now()) {
      throw AppError.unauthorized('INVALID_MAGIC_LINK', 'Link inválido ou expirado.');
    }
    this.state.magicLinks.delete(token);
    const account = this.state.findAccountByEmail(entry.email);
    if (!account) throw AppError.unauthorized('INVALID_MAGIC_LINK', 'Link inválido ou expirado.');
    return this.toProfile(account);
  }

  async register(request: RegisterRequest): Promise<IdentityProfile> {
    if (this.state.findAccountByEmail(request.email)) {
      throw AppError.conflict('EMAIL_ALREADY_REGISTERED', 'Já existe uma conta com este e-mail.');
    }
    const account = this.state.createAccount({
      email: request.email,
      password: request.password,
      firstName: request.firstName,
      lastName: request.lastName,
      cpf: request.cpf.replace(/\D/g, ''),
      phone: request.phone,
      birthDate: request.birthDate,
    });
    return this.toProfile(account);
  }

  async getProfile(customerId: string): Promise<IdentityProfile | null> {
    const account = this.state.accounts.get(customerId);
    return account ? this.toProfile(account) : null;
  }

  async updateProfile(customerId: string, request: UpdateProfileRequest): Promise<IdentityProfile> {
    const account = this.state.accounts.get(customerId);
    if (!account) throw AppError.notFound('CUSTOMER_NOT_FOUND', 'Cliente não encontrado.');
    if (request.firstName !== undefined) account.firstName = request.firstName;
    if (request.lastName !== undefined) account.lastName = request.lastName;
    if (request.phone !== undefined) account.phone = request.phone;
    if (request.gender !== undefined) account.gender = request.gender;
    const sub = this.state.subscriptions.get(customerId);
    if (sub?.shippingAddress) {
      sub.shippingAddress.recipient = `${account.firstName} ${account.lastName}`;
    }
    return this.toProfile(account);
  }
}
