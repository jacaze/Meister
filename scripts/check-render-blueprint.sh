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
if rules[:2] != [("/api/*", rules[0][1]), ("/*", "/index.html")] or not rules[0][1].endswith("/api/*"):
    errs.append("routes do static site devem ser /api/* -> API e /* -> /index.html (nessa ordem)")
if errs:
    print("\n".join("ERRO: " + e for e in errs)); sys.exit(1)
print("OK: render.yaml válido (free, sem segredos, rotas e variáveis obrigatórias).")
PY
