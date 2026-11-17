import { useState } from 'react';
import { Alert } from '@/src/components/feedback/Alert';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { FormField } from '@/src/components/ui/FormField';
import { Input } from '@/src/components/ui/Input';
import { Select } from '@/src/components/ui/Select';
import { BD_PHONE_REGEX } from '@/src/config/bangladesh';
import { useAuth } from '@/src/hooks/useAuth';
import { useLocale } from '@/src/hooks/useLocale';
import { useRouter } from '@/src/hooks/useRouter';
import { apiClient } from '@/src/lib/apiClient';

export function LoginPage() {
  const { messages } = useLocale();
  const { navigate } = useRouter();
  const { login, verifyMfa, loginWithGoogle } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await login(identifier.trim(), password);
      if (res.mfaRequired) {
        setMfaRequired(true);
      } else {
        const isStaff = res.user.roles.some((r) => r !== 'CUSTOMER');
        navigate(isStaff ? '/admin' : '/account');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : messages.common.errorGeneric);
    } finally {
      setLoading(false);
    }
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      await verifyMfa(mfaCode.trim());
      navigate('/admin');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : messages.common.errorGeneric);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await loginWithGoogle();
      if (res.mfaRequired) {
        setMfaRequired(true);
      } else {
        navigate('/account');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : messages.common.errorGeneric);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <Card className="space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="font-display text-3xl font-semibold text-brand-charcoal">
            {mfaRequired ? messages.admin.mfaTitle : messages.account.loginTitle}
          </h1>
          {mfaRequired && (
            <p className="text-sm text-brand-charcoal-muted">{messages.admin.mfaSubtitle}</p>
          )}
        </div>

        {errorMsg && <Alert variant="error">{errorMsg}</Alert>}

        {mfaRequired ? (
          <form onSubmit={handleMfaVerify} className="space-y-4">
            <FormField id="mfa-code" label="MFA Passcode" required>
              <Input
                id="mfa-code"
                type="password"
                required
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder="••••••"
              />
            </FormField>
            <Button type="submit" fullWidth isLoading={loading}>
              {messages.admin.verifyMfa}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <FormField id="login-id" label={messages.account.identifier} required>
              <Input
                id="login-id"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="email@example.com or 01XXXXXXXXX"
              />
            </FormField>

            <FormField id="login-pw" label={messages.account.password} required>
              <Input
                id="login-pw"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => navigate('/reset-password')}
                className="text-xs font-medium text-brand-burgundy hover:underline cursor-pointer"
              >
                {messages.account.forgotPassword}
              </button>
            </div>

            <Button type="submit" fullWidth isLoading={loading}>
              {messages.account.signInBtn}
            </Button>

            <div className="relative py-1 text-center text-xs text-brand-charcoal-muted">
              <span>or</span>
            </div>

            <Button type="button" variant="secondary" fullWidth disabled={loading} onClick={() => void handleGoogle()}>
              {messages.account.googleSignIn}
            </Button>

            <p className="text-center text-xs text-brand-charcoal-muted pt-2">
              {messages.account.noAccount}{' '}
              <button
                type="button"
                onClick={() => navigate('/register')}
                className="font-medium text-brand-burgundy hover:underline cursor-pointer"
              >
                {messages.account.registerBtn}
              </button>
            </p>
          </form>
        )}
      </Card>
    </div>
  );
}

export function RegisterPage() {
  const { locale, messages } = useLocale();
  const { navigate } = useRouter();
  const { register } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [preferredLocale, setPreferredLocale] = useState<'en' | 'bn'>(locale);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!BD_PHONE_REGEX.test(phone.trim())) {
      setErrorMsg(messages.common.validationError);
      return;
    }
    setLoading(true);
    try {
      await register({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        preferredLocale,
      });
      navigate('/account');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : messages.common.errorGeneric);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <Card className="space-y-6">
        <h1 className="font-display text-3xl font-semibold text-center text-brand-charcoal">
          {messages.account.registerTitle}
        </h1>
        {errorMsg && <Alert variant="error">{errorMsg}</Alert>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField id="reg-name" label={messages.account.fullName} required>
            <Input id="reg-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </FormField>
          <FormField id="reg-email" label={messages.account.email} required>
            <Input id="reg-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
          <FormField id="reg-phone" label={messages.account.phone} required>
            <Input
              id="reg-phone"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01XXXXXXXXX"
            />
          </FormField>
          <FormField id="reg-pw" label={messages.account.password} required>
            <Input
              id="reg-pw"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>
          <FormField id="reg-loc" label="Language">
            <Select
              id="reg-loc"
              value={preferredLocale}
              onChange={(e) => setPreferredLocale(e.target.value === 'bn' ? 'bn' : 'en')}
              options={[
                { value: 'en', label: 'English' },
                { value: 'bn', label: 'বাংলা' },
              ]}
            />
          </FormField>
          <Button type="submit" fullWidth isLoading={loading}>
            {messages.account.registerBtn}
          </Button>
          <p className="text-center text-xs text-brand-charcoal-muted">
            {messages.account.haveAccount}{' '}
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="font-medium text-brand-burgundy hover:underline cursor-pointer"
            >
              {messages.account.signInBtn}
            </button>
          </p>
        </form>
      </Card>
    </div>
  );
}

export function ResetPasswordPage() {
  const { messages } = useLocale();
  const { navigate } = useRouter();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState<'request' | 'confirm' | 'done'>('request');
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const res = await apiClient.post<{ message: string; devPreviewToken?: string }>(
        '/api/v1/auth/password-reset/request',
        { email },
      );
      setInfoMsg(res.message);
      if (res.devPreviewToken) {
        setToken(res.devPreviewToken);
      }
      setStep('confirm');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : messages.common.errorGeneric);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await apiClient.post('/api/v1/auth/password-reset/confirm', { token, newPassword });
      setStep('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : messages.common.errorGeneric);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <Card className="space-y-5">
        <h1 className="font-display text-3xl font-semibold text-center">{messages.account.resetTitle}</h1>
        {errorMsg && <Alert variant="error">{errorMsg}</Alert>}
        {infoMsg && <Alert variant="info">{infoMsg}</Alert>}

        {step === 'request' && (
          <form onSubmit={handleRequest} className="space-y-4">
            <FormField id="rst-email" label={messages.account.email} required>
              <Input id="rst-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </FormField>
            <Button type="submit" fullWidth>{messages.common.submit}</Button>
          </form>
        )}

        {step === 'confirm' && (
          <form onSubmit={handleConfirm} className="space-y-4">
            <FormField id="rst-tok" label="Reset Token" required>
              <Input id="rst-tok" required value={token} onChange={(e) => setToken(e.target.value)} />
            </FormField>
            <FormField id="rst-pw" label="New Password" required>
              <Input
                id="rst-pw"
                type="password"
                minLength={8}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </FormField>
            <Button type="submit" fullWidth>{messages.common.save}</Button>
          </form>
        )}

        {step === 'done' && (
          <div className="space-y-4 text-center">
            <Alert variant="success">Password updated cleanly. Please sign in with your new password.</Alert>
            <Button fullWidth onClick={() => navigate('/login')}>{messages.account.signInBtn}</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
