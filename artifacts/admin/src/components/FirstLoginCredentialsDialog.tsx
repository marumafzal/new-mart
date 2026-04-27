/**
 * Optional post-login popup for the seeded super-admin while they are
 * still on the default credentials. Lets them update username and/or
 * password, or skip. Owns its `open` state locally because a derived
 * `open` would auto-close mid-submit when the password API clears
 * `usingDefaultCredentials` — that would hide partial-failure errors
 * for a subsequent username PATCH.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAdminAuth } from "@/lib/adminAuthContext";

/** Same rules the API enforces (validatePasswordStrength). */
function validateStrength(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(pw)) return "Password must contain at least 1 uppercase letter.";
  if (!/[0-9]/.test(pw)) return "Password must contain at least 1 number.";
  return null;
}

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
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [passwordSavedThisSession, setPasswordSavedThisSession] = useState(false);

  useEffect(() => {
    if (open) {
      setUsername(state.user?.username ?? "");
      setCurrentPassword("");
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
      (newPassword.length > 0 || currentPassword.length > 0 || confirmPassword.length > 0);

    if (!wantsUsernameChange && !wantsPasswordChange) {
      setFormError(
        passwordSavedThisSession
          ? "Pick a new username, or click Skip for now."
          : "Update your username, password, or both — or click Skip for now.",
      );
      return;
    }

    if (wantsPasswordChange) {
      if (!currentPassword) {
        setFormError("Enter your current password to confirm a password change.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setFormError("The new password and confirmation do not match.");
        return;
      }
      const strengthError = validateStrength(newPassword);
      if (strengthError) {
        setFormError(strengthError);
        return;
      }
      if (newPassword === currentPassword) {
        setFormError("The new password must be different from the current one.");
        return;
      }
    }

    setSubmitting(true);
    try {
      if (wantsPasswordChange) {
        try {
          await changePassword(currentPassword, newPassword);
          setPasswordSavedThisSession(true);
          setCurrentPassword("");
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
          return; // keep dialog open, username field still active
        }
      }

      // All requested operations succeeded.
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Treat any close attempt (Esc, outside-click, X button) as
        // "Skip for now" — defaults stay valid. Suppress while we are
        // mid-submit so a stray click can't drop the dialog before the
        // server round-trips finish.
        if (!next && !submitting) handleSkip();
      }}
    >
      <DialogContent className="sm:max-w-lg" data-testid="dialog-first-login-credentials">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
              <KeyRound className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-lg">Customise your admin credentials</DialogTitle>
              <DialogDescription className="mt-1">
                You're signed in with the default credentials. Pick a new
                username and/or password, or skip for now to keep using
                the defaults.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="flcd-username">
              New username
            </label>
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

          {passwordSavedThisSession ? (
            <div
              className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300 flex items-start gap-2"
              data-testid="text-password-saved"
            >
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Password updated.</p>
                <p className="text-xs opacity-80">
                  Finish by saving the new username, or click Skip for now.
                </p>
              </div>
            </div>
          ) : (
            <div className="border-t pt-4 space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="flcd-current">
                  Current password
                </label>
                <Input
                  id="flcd-current"
                  type={showPasswords ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Required to change password"
                  autoComplete="current-password"
                  disabled={submitting}
                  data-testid="input-current-password"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="flcd-new">
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
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPasswords((v) => !v)}
                    tabIndex={-1}
                  >
                    {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
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

          {formError && (
            <div
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              data-testid="text-credentials-error"
            >
              {formError}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                handleSkip();
                setLocation("/set-new-password");
              }}
              disabled={submitting}
              className="sm:mr-auto"
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
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default FirstLoginCredentialsDialog;
