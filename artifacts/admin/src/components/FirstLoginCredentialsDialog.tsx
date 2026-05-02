import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAdminAuth } from "@/lib/adminAuthContext";

const DOCUMENTED_DEFAULT_PASSWORD = "Toqeerkhan@123.com";

function validateStrength(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(pw)) return "Password must contain at least 1 uppercase letter.";
  if (!/[0-9]/.test(pw)) return "Password must contain at least 1 number.";
  return null;
}

type StrengthLevel = 0 | 1 | 2 | 3 | 4;

function computeStrength(pw: string): StrengthLevel {
  if (!pw) return 0;
  if (pw.length < 8) return 1;
  if (!/[A-Z]/.test(pw)) return 2;
  if (!/[0-9]/.test(pw)) return 3;
  return 4;
}

const STRENGTH_LABELS: Record<StrengthLevel, string> = {
  0: "",
  1: "Weak",
  2: "Fair",
  3: "Good",
  4: "Strong",
};

const STRENGTH_COLORS: Record<StrengthLevel, string> = {
  0: "",
  1: "bg-red-500",
  2: "bg-orange-400",
  3: "bg-yellow-400",
  4: "bg-emerald-500",
};

const STRENGTH_TEXT_COLORS: Record<StrengthLevel, string> = {
  0: "",
  1: "text-red-500",
  2: "text-orange-400",
  3: "text-yellow-500",
  4: "text-emerald-600 dark:text-emerald-400",
};

export function FirstLoginCredentialsDialog() {
  const [, setLocation] = useLocation();
  const { state, changePassword, updateOwnProfile, dismissDefaultCredentialsPrompt } =
    useAdminAuth();
  const { toast } = useToast();

  const wantsToShow = useMemo(
    () =>
      !!state.accessToken &&
      !!state.usingDefaultCredentials &&
      !state.defaultCredentialsDismissed,
    [state.accessToken, state.usingDefaultCredentials, state.defaultCredentialsDismissed],
  );

  const [open, setOpen] = useState(wantsToShow);

  useEffect(() => {
    if (wantsToShow) setOpen(true);
  }, [wantsToShow]);

  useEffect(() => {
    if (!state.accessToken) setOpen(false);
  }, [state.accessToken]);

  const [username, setUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [passwordSavedThisSession, setPasswordSavedThisSession] = useState(false);

  useEffect(() => {
    if (open) {
      setUsername(state.user?.username ?? "");
      setNewPassword("");
      setConfirmPassword("");
      setFormError(null);
      setPasswordSavedThisSession(false);
    }
  }, [open, state.user?.username]);

  const handleSkip = () => {
    dismissDefaultCredentialsPrompt();
    setOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedUsername = username.trim();
    const currentUsername = state.user?.username ?? "";
    const wantsUsernameChange =
      trimmedUsername.length > 0 && trimmedUsername !== currentUsername;
    const wantsPasswordChange =
      !passwordSavedThisSession &&
      (newPassword.length > 0 || confirmPassword.length > 0);

    if (!wantsUsernameChange && !wantsPasswordChange) {
      setFormError(
        passwordSavedThisSession
          ? "Pick a new username, or click Skip for now."
          : "Update your username, password, or both — or click Skip for now.",
      );
      return;
    }

    if (wantsPasswordChange) {
      if (newPassword !== confirmPassword) {
        setFormError("The new password and confirmation do not match.");
        return;
      }
      const strengthError = validateStrength(newPassword);
      if (strengthError) {
        setFormError(strengthError);
        return;
      }
      if (newPassword === DOCUMENTED_DEFAULT_PASSWORD) {
        setFormError("The new password must be different from the default.");
        return;
      }
    }

    setSubmitting(true);
    try {
      if (wantsPasswordChange) {
        try {
          await changePassword(DOCUMENTED_DEFAULT_PASSWORD, newPassword);
          setPasswordSavedThisSession(true);
          setNewPassword("");
          setConfirmPassword("");
        } catch (err) {
          setFormError(
            err instanceof Error ? err.message : "Failed to update your password.",
          );
          return;
        }
      }

      if (wantsUsernameChange) {
        try {
          await updateOwnProfile({ username: trimmedUsername });
        } catch (err) {
          const baseMsg =
            err instanceof Error ? err.message : "Failed to update your username.";
          setFormError(
            passwordSavedThisSession
              ? `Password was updated, but username change failed: ${baseMsg}`
              : baseMsg,
          );
          return;
        }
      }

      toast({
        title: "Credentials updated",
        description:
          wantsPasswordChange && wantsUsernameChange
            ? "Use your new username and password on next login."
            : wantsPasswordChange
              ? "Use your new password on next login."
              : "Use your new username on next login.",
      });
      dismissDefaultCredentialsPrompt();
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const strengthLevel = computeStrength(newPassword);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !submitting) handleSkip();
      }}
    >
      <DialogContent
        className="sm:max-w-lg p-0 [&>button[aria-label='Close\\ dialog']]:text-white/80 [&>button[aria-label='Close\\ dialog']]:hover:bg-white/20 [&>button[aria-label='Close\\ dialog']]:hover:text-white [&>button[aria-label='Close\\ dialog']]:focus:ring-white/50"
        data-testid="dialog-first-login-credentials"
      >
        {/* Gradient header — fills full width because DialogContent is p-0 */}
        <div className="bg-gradient-to-br from-amber-500 via-amber-400 to-orange-400 dark:from-amber-600 dark:via-amber-500 dark:to-orange-500 px-6 pt-7 pb-6">
          <div className="flex items-center gap-4 pr-8">
            <div className="w-12 h-12 rounded-xl bg-white/20 ring-2 ring-white/30 backdrop-blur-sm flex items-center justify-center shrink-0 shadow-lg">
              <KeyRound className="h-6 w-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold text-white leading-tight">
                Secure your admin account
              </DialogTitle>
              <DialogDescription className="text-sm text-amber-100/90 mt-0.5 leading-snug">
                You're using default credentials. Set a unique username and password to protect your panel.
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Form body — owns its own horizontal padding */}
        <form onSubmit={handleSubmit} className="px-6 pt-5 pb-0 space-y-4">

          {/* Username section */}
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-2">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Username
              </span>
            </div>
            <Input
              id="flcd-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={state.user?.username ?? "admin"}
              autoComplete="username"
              disabled={submitting}
              data-testid="input-new-username"
            />
            <p className="text-xs text-muted-foreground">
              Leave unchanged to keep the current username.
            </p>
          </div>

          {/* Password section */}
          {passwordSavedThisSession ? (
            <div
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 flex items-start gap-3"
              data-testid="text-password-saved"
            >
              <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  Password updated successfully
                </p>
                <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
                  Finish by saving a new username, or click Skip for now.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-3">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  New Password
                </span>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium sr-only" htmlFor="flcd-new">
                  New password
                </label>
                <div className="relative">
                  <Input
                    id="flcd-new"
                    type={showPasswords ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 chars, 1 uppercase, 1 number"
                    autoComplete="new-password"
                    disabled={submitting}
                    className="pr-10"
                    data-testid="input-new-password"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 w-9 flex items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    onClick={() => setShowPasswords((v) => !v)}
                    aria-label={showPasswords ? "Hide password" : "Show password"}
                    aria-pressed={showPasswords}
                  >
                    {showPasswords
                      ? <EyeOff className="h-4 w-4" />
                      : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Password strength indicator */}
                {newPassword.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex gap-1">
                      {([1, 2, 3, 4] as const).map((bar) => (
                        <div
                          key={bar}
                          className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                            strengthLevel >= bar
                              ? STRENGTH_COLORS[strengthLevel]
                              : "bg-border"
                          }`}
                        />
                      ))}
                    </div>
                    {strengthLevel > 0 && (
                      <p className={`text-xs font-medium ${STRENGTH_TEXT_COLORS[strengthLevel]}`}>
                        {STRENGTH_LABELS[strengthLevel]}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="flcd-confirm">
                  Confirm new password
                </label>
                <Input
                  id="flcd-confirm"
                  type={showPasswords ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter the new password"
                  autoComplete="new-password"
                  disabled={submitting}
                  data-testid="input-confirm-password"
                />
              </div>
            </div>
          )}

          {/* Error banner */}
          {formError && (
            <div
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 flex items-start gap-2.5"
              data-testid="text-credentials-error"
            >
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive leading-snug">{formError}</p>
            </div>
          )}

          {/* Footer — negative horizontal margin bleeds to DialogContent edge (p-0) */}
          <div className="-mx-6 px-6 py-4 border-t border-border flex flex-col sm:flex-row items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                handleSkip();
                setLocation("/set-new-password");
              }}
              disabled={submitting}
              className="sm:mr-auto text-muted-foreground hover:text-foreground text-sm"
              data-testid="button-open-full-screen"
            >
              Open the full password screen
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSkip}
              disabled={submitting}
              data-testid="button-skip-credentials"
            >
              Skip for now
            </Button>
            <Button type="submit" disabled={submitting} data-testid="button-save-credentials">
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default FirstLoginCredentialsDialog;
