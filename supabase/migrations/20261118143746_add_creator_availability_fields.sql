-- Store creator availability settings so Home actions update the account's live profile.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS availability_status text,
  ADD COLUMN IF NOT EXISTS availability_date date;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_availability_fields_valid;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_availability_fields_valid
  CHECK (
    (availability_status IS NULL OR availability_status IN (
      'Open to opportunities',
      'Available from a date',
      'Not available right now'
    ))
    AND (
      (availability_status = 'Available from a date' AND availability_date IS NOT NULL)
      OR (availability_status IS DISTINCT FROM 'Available from a date' AND availability_date IS NULL)
    )
  );
