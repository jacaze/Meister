#!/usr/bin/env bash
# Valida render.yaml: YAML válido, plano free, sem segredos em claro e variáveis obrigatórias presentes.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python3 - "$ROOT_DIR/render.yaml" <<'PY'
import re, sys, yaml

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
if "prisma migrate deploy" not in api.get("dockerCommand", ""):
    errs.append("dockerCommand deve rodar prisma migrate deploy")
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
for s_ in (api, web):
    if s_.get("region") != "virginia":
        errs.append(f"{s_['name']} deve usar region virginia (mesma do Neon US East)")
if errs:
    print("\n".join("ERRO: " + e for e in errs)); sys.exit(1)
print("OK: render.yaml válido (free, sem segredos, fallback SPA, VITE_API_URL e variáveis obrigatórias).")
PY
