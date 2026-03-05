// Authentication screen — Login & Register with dark SKYTRAC theme
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogin, useRegister } from '../hooks/useAuth';
import { useAppTheme } from '../theme';

type AuthMode = 'login' | 'register';

export function AuthScreen() {
  const { colors, spacing, radius, typography } = useAppTheme();
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deviceSerial, setDeviceSerial] = useState('');
  const [site, setSite] = useState('');
  const [localError, setLocalError] = useState('');

  const navigate = useNavigate();
  const { login, loading: loginLoading, error: loginError } = useLogin();
  const { register, loading: registerLoading, error: registerError } = useRegister();

  const loading = loginLoading || registerLoading;
  const error = localError || loginError || registerError;

  const handleSubmit = async () => {
    setLocalError('');

    if (!username.trim() || !password.trim()) {
      setLocalError('Username and password are required');
      return;
    }

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match');
        return;
      }
      if (password.length < 6) {
        setLocalError('Password must be at least 6 characters');
        return;
      }

      const result = await register(username, password, deviceSerial || undefined, site || undefined);
      if (!result.error) {
        navigate('/ptt');
      }
    } else {
      const result = await login(username, password);
      if (!result.error) {
        navigate('/ptt');
      }
    }
  };

  const toggleMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setLocalError('');
    setConfirmPassword('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleSubmit();
    }
  };

  // Styles
  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: colors.background.primary,
      padding: spacing.xl,
    },
    card: {
      backgroundColor: colors.background.secondary,
      borderRadius: radius.xl,
      padding: spacing.xxl,
      width: '100%',
      maxWidth: 380,
      boxShadow: `0 8px 32px ${colors.accent.glowStrong}`,
      border: `1px solid ${colors.border.subtle}`,
    },
    logo: {
      textAlign: 'center' as const,
      marginBottom: spacing.xxl,
    },
    logoText: {
      fontSize: typography.size.xxxl,
      fontWeight: typography.weight.bold as any,
      color: colors.text.primary,
      letterSpacing: typography.letterSpacing.wider,
      marginBottom: spacing.xs,
    },
    logoSubtext: {
      fontSize: typography.size.sm,
      color: colors.text.muted,
      letterSpacing: typography.letterSpacing.wide,
    },
    title: {
      fontSize: typography.size.xl,
      fontWeight: typography.weight.semibold as any,
      color: colors.text.primary,
      textAlign: 'center' as const,
      marginBottom: spacing.xl,
    },
    inputGroup: {
      marginBottom: spacing.md,
    },
    label: {
      display: 'block',
      fontSize: typography.size.sm,
      color: colors.text.secondary,
      marginBottom: spacing.xs,
      fontWeight: typography.weight.medium as any,
    },
    input: {
      width: '100%',
      padding: `${spacing.md}px ${spacing.lg}px`,
      fontSize: typography.size.md,
      backgroundColor: colors.background.tertiary,
      border: `1px solid ${colors.border.subtle}`,
      borderRadius: radius.md,
      color: colors.text.primary,
      outline: 'none',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      boxSizing: 'border-box' as const,
    },
    inputFocus: {
      borderColor: colors.accent.primary,
      boxShadow: `0 0 0 2px ${colors.accent.glow}`,
    },
    error: {
      backgroundColor: colors.status.dangerSubtle,
      border: `1px solid ${colors.status.danger}`,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    errorText: {
      color: colors.status.danger,
      fontSize: typography.size.sm,
      textAlign: 'center' as const,
      margin: 0,
    },
    button: {
      width: '100%',
      padding: `${spacing.lg}px`,
      fontSize: typography.size.lg,
      fontWeight: typography.weight.semibold as any,
      backgroundColor: colors.accent.primary,
      color: colors.text.primary,
      border: 'none',
      borderRadius: radius.md,
      cursor: 'pointer',
      transition: 'background-color 0.2s, transform 0.1s',
      marginTop: spacing.lg,
    },
    buttonHover: {
      backgroundColor: colors.accent.primaryLight,
    },
    buttonDisabled: {
      opacity: 0.6,
      cursor: 'not-allowed',
    },
    switchContainer: {
      textAlign: 'center' as const,
      marginTop: spacing.xl,
    },
    switchText: {
      fontSize: typography.size.sm,
      color: colors.text.muted,
    },
    switchLink: {
      color: colors.status.info,
      cursor: 'pointer',
      fontWeight: typography.weight.medium as any,
      textDecoration: 'none',
      marginLeft: spacing.xs,
    },
    divider: {
      display: 'flex',
      alignItems: 'center',
      margin: `${spacing.lg}px 0`,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border.subtle,
    },
    dividerText: {
      padding: `0 ${spacing.md}px`,
      fontSize: typography.size.xs,
      color: colors.text.muted,
      textTransform: 'uppercase' as const,
      letterSpacing: typography.letterSpacing.wider,
    },
    optionalSection: {
      marginTop: spacing.lg,
      paddingTop: spacing.lg,
      borderTop: `1px solid ${colors.border.subtle}`,
    },
    optionalTitle: {
      fontSize: typography.size.xs,
      color: colors.text.muted,
      textTransform: 'uppercase' as const,
      letterSpacing: typography.letterSpacing.wider,
      marginBottom: spacing.md,
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logo}>
          <h1 style={styles.logoText}>SKYTALK</h1>
          <p style={styles.logoSubtext}>SECURE COMMUNICATIONS</p>
        </div>

        {/* Title */}
        <h2 style={styles.title}>
          {mode === 'login' ? 'Sign In' : 'Create Account'}
        </h2>

        {/* Error Message */}
        {error && (
          <div style={styles.error}>
            <p style={styles.errorText}>{error}</p>
          </div>
        )}

        {/* Username */}
        <div style={styles.inputGroup}>
          <label style={styles.label}>Username</label>
          <input
            type="text"
            placeholder="Enter username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={handleKeyPress}
            style={styles.input}
            autoComplete="username"
            autoFocus
          />
        </div>

        {/* Password */}
        <div style={styles.inputGroup}>
          <label style={styles.label}>Password</label>
          <input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={handleKeyPress}
            style={styles.input}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </div>

        {/* Confirm Password (Register only) */}
        {mode === 'register' && (
          <div style={styles.inputGroup}>
            <label style={styles.label}>Confirm Password</label>
            <input
              type="password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              style={styles.input}
              autoComplete="new-password"
            />
          </div>
        )}

        {/* Optional Fields (Register only) */}
        {mode === 'register' && (
          <div style={styles.optionalSection}>
            <p style={styles.optionalTitle}>Optional Device Info</p>
            
            <div style={styles.inputGroup}>
              <label style={styles.label}>Device Serial</label>
              <input
                type="text"
                placeholder="e.g., DLS140-001"
                value={deviceSerial}
                onChange={(e) => setDeviceSerial(e.target.value)}
                onKeyPress={handleKeyPress}
                style={styles.input}
              />
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Site</label>
              <input
                type="text"
                placeholder="e.g., HQ, Field-A"
                value={site}
                onChange={(e) => setSite(e.target.value)}
                onKeyPress={handleKeyPress}
                style={styles.input}
              />
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            ...styles.button,
            ...(loading ? styles.buttonDisabled : {}),
          }}
        >
          {loading ? 'Please wait...' : mode === 'login' ? 'Connect' : 'Create Account'}
        </button>

        {/* Switch Mode */}
        <div style={styles.switchContainer}>
          <span style={styles.switchText}>
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
            <span style={styles.switchLink} onClick={toggleMode}>
              {mode === 'login' ? 'Register' : 'Sign In'}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default AuthScreen;
