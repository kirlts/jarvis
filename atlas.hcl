env "local" {
  url = "postgresql://postgres:postgres_sandbox@127.0.0.1:5432/jarvis?search_path=public&sslmode=disable"
  dev = "docker://postgres/17/dev?search_path=public"
  migration {
    dir = "file://supabase/migrations"
  }
}
