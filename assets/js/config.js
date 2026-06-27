/* Cloud sync config. The anon key is PUBLIC by design — the wcc_vault table has
   RLS on with no policies, so this key cannot read it. All access goes through the
   passcode-gated `sync` edge function. Safe to commit. */
window.WCC_CONFIG = {
  enabled: true,
  syncUrl: "https://hnblbcmnmfwsevjoozjc.supabase.co/functions/v1/sync",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhuYmxiY21ubWZ3c2V2am9vempjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNzIxMDMsImV4cCI6MjA5Mjg0ODEwM30.w2mPyy5rc3yAeWPKSoyui2r5Tr-3235DzTBIOkVB6MQ"
};
