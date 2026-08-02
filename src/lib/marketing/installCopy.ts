import type { MarketingPlatform } from "./detectPlatform";

export type InstallModalLocale = "en" | "es";

export function getInstallModalLocale(language?: string): InstallModalLocale {
  const lang =
    language ??
    (typeof navigator !== "undefined" ? navigator.language : "en");
  return lang.toLowerCase().startsWith("es") ? "es" : "en";
}

type InstallStep = {
  title: string;
  body: string;
};

type InstallPlatformCopy = {
  steps: InstallStep[];
  fullGuideLabel: string;
  fullGuideUrl: string;
  openAppCta: string;
};

type InstallModalCopy = {
  headerTitle: string;
  headerSubtitle: string;
  ios: InstallPlatformCopy;
  android: InstallPlatformCopy;
  desktop: {
    title: string;
    body: string;
    primaryCta: string;
    secondaryCta: string;
  };
};

const COPY: Record<InstallModalLocale, InstallModalCopy> = {
  en: {
    headerTitle: "Install IndieFundr",
    headerSubtitle:
      "Add IndieFundr to your Home Screen to use it like an app. Mobile browser access is not supported.",
    ios: {
      steps: [
        {
          title: "Tap More",
          body: "Tap the More button (⋯) in Safari.",
        },
        {
          title: "Tap Share",
          body: "Tap Share.",
        },
        {
          title: "Add to Home Screen",
          body:
            "Scroll down and tap Add to Home Screen. If you do not see it, tap Edit Actions at the bottom of the list and add it.",
        },
        {
          title: "Turn on Open as Web App",
          body: "Enable Open as Web App before confirming.",
        },
        {
          title: "Tap Add",
          body: "Open IndieFundr from your Home Screen.",
        },
      ],
      fullGuideLabel: "View full guide on Apple Support",
      fullGuideUrl:
        "https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios",
      openAppCta: "Open IndieFundr",
    },
    android: {
      steps: [
        {
          title: "Tap More",
          body: "On the right of the address bar, tap More (⋮).",
        },
        {
          title: "Add to Home screen → Install",
          body: "Tap Add to Home screen, then Install.",
        },
        {
          title: "Follow the on-screen instructions",
          body: "Open IndieFundr from your Home Screen or app drawer.",
        },
      ],
      fullGuideLabel: "View full guide on Google Chrome Help",
      fullGuideUrl:
        "https://support.google.com/chrome/answer/9658361?hl=en&co=GENIE.Platform%3DAndroid",
      openAppCta: "Open IndieFundr",
    },
    desktop: {
      title: "Install on your phone",
      body: "Open this link on your iPhone or Android device, then follow the install steps to add IndieFundr to your Home Screen.",
      primaryCta: "Copy app link",
      secondaryCta: "Open app in this browser",
    },
  },
  es: {
    headerTitle: "Instalar IndieFundr",
    headerSubtitle:
      "Agregá IndieFundr a tu pantalla de inicio para usarla como una app. El acceso desde el navegador móvil no está disponible.",
    ios: {
      steps: [
        {
          title: "Tocá Más",
          body: "Tocá el botón Más (⋯) en Safari.",
        },
        {
          title: "Tocá Compartir",
          body: "Tocá Compartir.",
        },
        {
          title: "Agregar a pantalla de inicio",
          body:
            "Desplazate hacia abajo y tocá Agregar a pantalla de inicio. Si no aparece, tocá Editar acciones al final de la lista y agregala.",
        },
        {
          title: "Activá Abrir como app web",
          body: "Activá Abrir como app web antes de confirmar.",
        },
        {
          title: "Tocá Agregar",
          body: "Abrí IndieFundr desde tu pantalla de inicio.",
        },
      ],
      fullGuideLabel: "Ver guía completa en Soporte de Apple",
      fullGuideUrl:
        "https://support.apple.com/es-es/guide/iphone/iphea86e5236/ios",
      openAppCta: "Abrir IndieFundr",
    },
    android: {
      steps: [
        {
          title: "Tocá Más",
          body: "A la derecha de la barra de direcciones, tocá Más (⋮).",
        },
        {
          title: "Añadir a la pantalla de inicio → Instalar",
          body: "Tocá Añadir a la pantalla de inicio y luego Instalar.",
        },
        {
          title: "Seguí las instrucciones en pantalla",
          body: "Abrí IndieFundr desde tu pantalla de inicio o el cajón de apps.",
        },
      ],
      fullGuideLabel: "Ver guía completa en Ayuda de Google Chrome",
      fullGuideUrl:
        "https://support.google.com/chrome/answer/9658361?hl=es&co=GENIE.Platform%3DAndroid",
      openAppCta: "Abrir IndieFundr",
    },
    desktop: {
      title: "Instalá en tu teléfono",
      body: "Abrí este enlace en tu iPhone o dispositivo Android y seguí los pasos para agregar IndieFundr a tu pantalla de inicio.",
      primaryCta: "Copiar enlace de la app",
      secondaryCta: "Abrir app en este navegador",
    },
  },
};

export function getInstallModalCopy(
  locale: InstallModalLocale = "en"
): InstallModalCopy {
  return COPY[locale];
}

/** @deprecated Use getInstallModalCopy(locale) */
export const installModalCopy = COPY.en;

export function getInstallStepsForPlatform(
  platform: MarketingPlatform,
  locale: InstallModalLocale = "en"
) {
  const copy = getInstallModalCopy(locale);
  if (platform === "ios") return copy.ios.steps;
  if (platform === "android") return copy.android.steps;
  return [];
}
