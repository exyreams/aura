import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import Image from "next/image";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <div className="flex items-center">
          <Image
            src="/dark-logo-wordmark.svg"
            alt="AURA"
            width={88}
            height={24}
            style={{ width: 88, height: "auto" }}
            className="dark:block hidden"
          />
          <Image
            src="/light-logo-wordmark.svg"
            alt="AURA"
            width={88}
            height={24}
            style={{ width: 88, height: "auto" }}
            className="dark:hidden block"
          />
        </div>
      ),
    },
  };
}
