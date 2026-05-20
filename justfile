_default:
  @{{quote(just_executable())}} --list --justfile={{quote(justfile())}}

dev:
    turbo run dev


alias b:=build
build:
    turbo run "desktop#build"
