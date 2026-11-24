#!/usr/bin/env bash
# Valida render.yaml: YAML válido, plano free, sem segredos em claro e variáveis obrigatórias presentes.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python3 - "$ROOT_DIR/render.yaml" <<'PY'
import pathlib, re, sys, yaml
root = pathlib.Path(sys.argv[1]).resolve().parent

d = yaml.safe_load(open(sys.argv[1]))
errs = []
svcs = {s["name"]: s for s in d["services"]}
api, web = svcs.get("meister-api"), svcs.get("meister-web")
if not api or not web:
    sys.exit("ERRO: render.yaml precisa dos serviços meister-api e meister-web")
if api.get("plan") != "free":
    errs.append("meister-api deve usar plan free")
if "preDeployCommand" in api:
    errs.append("preDeployCommand não existe no plano free")
if api.get("healthCheckPath") != "/health/live":
    errs.append("healthCheckPath deve ser /health/live (não tocar no banco)")
if api.get("dockerCommand") != "./docker-start.sh":
    errs.append("dockerCommand da API deve ser ./docker-start.sh (sem aspas: o Render repassa aspas literalmente)")
start_sh = pathlib.Path(root, "backend", "docker-start.sh")
if not start_sh.exists() or "prisma migrate deploy" not in start_sh.read_text(encoding="utf-8"):
    errs.append("backend/docker-start.sh deve existir e rodar prisma migrate deploy")
sensitive = re.compile(r"SECRET|TOKEN|KEY|PASSWORD|DATABASE_URL|PLUGGY_CLIENT")
keys = set()
for s in d["services"]:
    for e in s.get("envVars", []):
        keys.add(e["key"])
        if sensitive.search(e["key"]) and "value" in e:
            errs.append(f"{e['key']} não pode ter valor literal (use sync: false ou generateValue)")
for k in ["DATABASE_URL", "JWT_SECRET", "INTERNAL_TICK_SECRET", "APP_URL", "CORS_ORIGINS", "TELEGRAM_MODE"]:
    if k not in keys:
        errs.append(f"variável obrigatória ausente: {k}")
rules = [(r["source"], r["destination"]) for r in web.get("routes", [])]
if rules != [("/*", "/index.html")]:
    errs.append("routes do static site devem ser apenas o fallback SPA /* -> /index.html (a API é chamada direto via VITE_API_URL, sem rewrite /api)")
if "VITE_API_URL" not in {e["key"] for e in web.get("envVars", [])}:
    errs.append("meister-web precisa da variável VITE_API_URL (sync: false)")
for e in web.get("envVars", []):
    if e["key"] == "VITE_API_URL" and e.get("sync") is not False:
        errs.append("VITE_API_URL deve ser sync: false (preenchida pelo dono)")
if api.get("region") != "virginia":
    errs.append("meister-api deve usar region virginia (mesma do Neon US East)")
if "region" in web:
    errs.append("meister-web (Static Site) não pode ter region: o Render recusa o Blueprint (static sites cannot have a region)")
if errs:
    print("\n".join("ERRO: " + e for e in errs)); sys.exit(1)
print("OK: render.yaml válido (free, sem segredos, fallback SPA, VITE_API_URL e variáveis obrigatórias).")
PY
