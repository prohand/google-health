// -----------------------------------------------------------------------------
// The sentences shown to the user, in the four languages of the interface.
// -----------------------------------------------------------------------------

import { localize, pick } from './i18n.js';
import { formatDuration } from './health/time.js';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

/** A number written the way the language writes it (8 200, 8.200, 8,200). */
export function formatNumber(value, language, digits = 0) {
  return new Intl.NumberFormat(LOCALES[language] ?? LOCALES.en, {
    maximumFractionDigits: digits,
  }).format(value);
}

export const MESSAGES = {
  missingClient: {
    en: 'Enter the client ID and the client secret of your Google Cloud project, then save.',
    fr: "Saisissez l'ID client et le secret client de votre projet Google Cloud, puis enregistrez.",
    de: 'Geben Sie die Client-ID und den Clientschlüssel Ihres Google-Cloud-Projekts ein und speichern Sie.',
    es: 'Introduzca el ID de cliente y el secreto de cliente de su proyecto de Google Cloud y guarde.',
  },
  notLinked: {
    en: 'No Google account linked yet: press "Connect" in the configuration.',
    fr: 'Aucun compte Google lié : cliquez sur « Connecter » dans la configuration.',
    de: 'Noch kein Google-Konto verknüpft: Klicken Sie in der Konfiguration auf „Verbinden“.',
    es: 'Ninguna cuenta de Google vinculada: pulse «Conectar» en la configuración.',
  },
  reauthorize: {
    en: 'Google refused the access (revoked or expired): connect your Google account again.',
    fr: "Google a refusé l'accès (révoqué ou expiré) : reconnectez votre compte Google.",
    de: 'Google hat den Zugriff abgelehnt (widerrufen oder abgelaufen): Verbinden Sie Ihr Google-Konto erneut.',
    es: 'Google ha rechazado el acceso (revocado o caducado): vuelva a conectar su cuenta de Google.',
  },
  accountNotLinked: {
    en: 'This Google account has no Google Health (Fitbit) profile: create one in the Fitbit app first.',
    fr: "Ce compte Google n'a pas de profil Google Health (Fitbit) : créez-le d'abord dans l'application Fitbit.",
    de: 'Dieses Google-Konto hat kein Google-Health-Profil (Fitbit): Legen Sie es zuerst in der Fitbit-App an.',
    es: 'Esta cuenta de Google no tiene perfil de Google Health (Fitbit): créelo primero en la aplicación Fitbit.',
  },
  permissionDenied: {
    en: 'Google denied the access: enable the Google Health API in your project and tick every permission when connecting.',
    fr: "Google a refusé l'accès : activez l'API Google Health dans votre projet et cochez toutes les autorisations à la connexion.",
    de: 'Google hat den Zugriff verweigert: Aktivieren Sie die Google Health API in Ihrem Projekt und erteilen Sie beim Verbinden alle Berechtigungen.',
    es: 'Google ha denegado el acceso: active la API de Google Health en su proyecto y marque todos los permisos al conectar.',
  },
  rateLimited: {
    en: 'Google is limiting the requests for now: the next read will try again.',
    fr: 'Google limite les requêtes pour le moment : la prochaine lecture réessaiera.',
    de: 'Google begrenzt derzeit die Anfragen: Der nächste Abruf versucht es erneut.',
    es: 'Google está limitando las peticiones por ahora: la próxima lectura lo intentará de nuevo.',
  },
  unreachable: {
    en: 'The Google Health API could not be reached: check the Internet connection of Gladys.',
    fr: "L'API Google Health est injoignable : vérifiez la connexion Internet de Gladys.",
    de: 'Die Google Health API ist nicht erreichbar: Prüfen Sie die Internetverbindung von Gladys.',
    es: 'No se puede acceder a la API de Google Health: compruebe la conexión a Internet de Gladys.',
  },
  syncButton: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  noData: {
    en: 'No data read yet.',
    fr: 'Aucune donnée lue pour le moment.',
    de: 'Noch keine Daten abgerufen.',
    es: 'Aún no se han leído datos.',
  },
};

/**
 * "Not linked", plus the redirect URI to declare at Google once a connection
 * was attempted: Google refuses any URI the OAuth client does not list.
 */
export function notLinkedHelp(redirectUri) {
  if (!redirectUri) return MESSAGES.notLinked;
  return localize(
    (language) =>
      `${pick(language, MESSAGES.notLinked)} ${pick(language, {
        en: 'Authorized redirect URI to declare in your Google OAuth client:',
        fr: 'URI de redirection autorisé à déclarer dans votre client OAuth Google :',
        de: 'Autorisierte Weiterleitungs-URI, die im Google-OAuth-Client einzutragen ist:',
        es: 'URI de redireccionamiento autorizado que declarar en su cliente OAuth de Google:',
      })} ${redirectUri}`,
  );
}

/** The message of a failed read, from the error the read threw. */
export function errorMessage(err) {
  if (err?.name === 'ReauthorizationRequiredError') return MESSAGES.reauthorize;
  if (err?.reason === 'ACCOUNT_NOT_LINKED') return MESSAGES.accountNotLinked;
  if (err?.status === 403) return MESSAGES.permissionDenied;
  if (err?.status === 429) return MESSAGES.rateLimited;
  return MESSAGES.unreachable;
}

/** Answer of the "Test the connection" and "Refresh now" buttons. */
export function syncReport(snapshot) {
  const { values, errors } = snapshot;
  const count = Object.keys(values).length;
  return localize((language) => {
    const steps =
      values.steps === undefined
        ? ''
        : pick(language, {
            en: ` ${formatNumber(values.steps, language)} steps today.`,
            fr: ` ${formatNumber(values.steps, language)} pas aujourd'hui.`,
            de: ` ${formatNumber(values.steps, language)} Schritte heute.`,
            es: ` ${formatNumber(values.steps, language)} pasos hoy.`,
          });
    const missing =
      errors.length === 0
        ? ''
        : pick(language, {
            en: ` ${errors.length} metric(s) could not be read (permission not granted?).`,
            fr: ` ${errors.length} mesure(s) illisible(s) (autorisation non accordée ?).`,
            de: ` ${errors.length} Messwert(e) nicht lesbar (Berechtigung nicht erteilt?).`,
            es: ` ${errors.length} métrica(s) no se han podido leer (¿permiso no concedido?).`,
          });
    return (
      pick(language, {
        en: `Google Health answered: ${count} metrics read.`,
        fr: `Google Health a répondu : ${count} mesures lues.`,
        de: `Google Health hat geantwortet: ${count} Messwerte gelesen.`,
        es: `Google Health ha respondido: ${count} métricas leídas.`,
      }) +
      steps +
      missing
    );
  });
}

/**
 * The figures of the day in one sentence, for a message or a speaker
 * (output `summary` of the `get_daily_summary` scene action).
 */
export function dailySummaryText(snapshot, config, language) {
  const { values } = snapshot;
  const parts = [];
  if (values.steps !== undefined) {
    const steps = formatNumber(values.steps, language);
    const goal = formatNumber(config.steps_goal, language);
    parts.push(
      pick(language, {
        en: `${steps} steps (goal ${goal})`,
        fr: `${steps} pas (objectif ${goal})`,
        de: `${steps} Schritte (Ziel ${goal})`,
        es: `${steps} pasos (objetivo ${goal})`,
      }),
    );
  }
  if (values.distance !== undefined) parts.push(`${formatNumber(values.distance, language, 1)} km`);
  if (values.total_calories !== undefined) {
    parts.push(`${formatNumber(values.total_calories, language)} kcal`);
  }
  const sentences = [];
  if (parts.length > 0) {
    const today = pick(language, { en: 'Today', fr: "Aujourd'hui", de: 'Heute', es: 'Hoy' });
    sentences.push(`${today}${language === 'fr' ? ' :' : ':'} ${parts.join(', ')}.`);
  }
  if (values.sleep_duration !== undefined) {
    const duration = formatDuration(values.sleep_duration);
    sentences.push(
      pick(language, {
        en: `Last sleep: ${duration}.`,
        fr: `Dernier sommeil : ${duration}.`,
        de: `Letzter Schlaf: ${duration}.`,
        es: `Último sueño: ${duration}.`,
      }),
    );
  }
  if (values.resting_heart_rate !== undefined) {
    sentences.push(
      pick(language, {
        en: `Resting heart rate: ${values.resting_heart_rate} bpm.`,
        fr: `Fréquence cardiaque au repos : ${values.resting_heart_rate} bpm.`,
        de: `Ruhepuls: ${values.resting_heart_rate} bpm.`,
        es: `Frecuencia cardíaca en reposo: ${values.resting_heart_rate} lpm.`,
      }),
    );
  }
  if (values.weight !== undefined) {
    const weight = formatNumber(values.weight, language, 1);
    sentences.push(
      pick(language, {
        en: `Weight: ${weight} kg.`,
        fr: `Poids : ${weight} kg.`,
        de: `Gewicht: ${weight} kg.`,
        es: `Peso: ${weight} kg.`,
      }),
    );
  }
  return sentences.length > 0 ? sentences.join(' ') : pick(language, MESSAGES.noData);
}
