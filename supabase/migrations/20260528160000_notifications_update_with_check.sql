-- BUG-7: The "users mark notifications read" UPDATE policy had USING but no
-- WITH CHECK, which allowed a recipient to mutate any column on their own
-- notification rows (not just read_at). Recreate it with a matching WITH CHECK
-- so only the recipient column set is constrained on both the read and write side.
DROP POLICY IF EXISTS "users mark notifications read" ON public.notifications;
CREATE POLICY "users mark notifications read" ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);
