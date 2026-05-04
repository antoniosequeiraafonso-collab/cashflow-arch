# Cashflow Arch

Webapp simples para registar despesas e entradas, com dashboard e gravação no Firebase Firestore.

## Como testar localmente

Como o ficheiro usa Firebase com `type="module"`, o ideal é correr com um servidor local.

Se tiveres Python instalado:

```bash
cd cashflow-webapp
python -m http.server 5500
```

Depois abre:

```text
http://localhost:5500
```

PIN:

```text
1906
```

## Firebase necessário

1. Firestore criado.
2. Authentication > Anonymous activado.
3. Firestore Rules:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /movements/{document} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Publicar grátis no Firebase Hosting

Instalar Firebase CLI:

```bash
npm install -g firebase-tools
```

Login:

```bash
firebase login
```

Iniciar hosting dentro desta pasta:

```bash
firebase init hosting
```

Escolher:
- Projecto: cashflow-arch
- Public directory: .
- Configure as single-page app: No
- Overwrite index.html: No

Publicar:

```bash
firebase deploy
```
