import { motion, type Variants } from "motion/react";
import {
  type IconProps,
  IconWrapper,
  useAnimationWrapperContext,
  useVariants,
} from "./utils/AnimationWrapper";

type DocumentCodeProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    group: {
      initial: {
        rotate: 0,
        scale: 1,
      },
      animate: {
        transition: {
          duration: 1.83,
        },
      },
    },
    path1: {
      initial: {
        pathLength: 1,
        opacity: 1,
      },
      animate: {
        pathLength: [1, 0, 1],
        opacity: [1, 0.25, 1],
        transition: {
          duration: 0.94,
          ease: "easeInOut",
          delay: 0.19,
        },
      },
    },
    path2: {
      initial: {
        pathLength: 1,
        opacity: 1,
      },
      animate: {
        pathLength: [1, 0, 1],
        opacity: [1, 0.25, 1],
        transition: {
          duration: 1,
          ease: "easeInOut",
          delay: 0.27,
        },
      },
    },
    path3: {
      initial: {
        pathLength: 1,
        opacity: 1,
      },
      animate: {
        pathLength: [1, 0, 1],
        opacity: [1, 0.25, 1],
        transition: {
          duration: 1.12,
          ease: "easeInOut",
          delay: 0,
        },
      },
    },
    path4: {
      initial: {
        pathLength: 1,
        opacity: 1,
      },
      animate: {
        pathLength: [1, 0, 1],
        opacity: [1, 0.25, 1],
        transition: {
          duration: 1.18,
          ease: "easeInOut",
          delay: 0.11,
        },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({
  size = 24,
  strokeWidth = 1.5,
  "aria-label": ariaLabel,
  ...props
}: IconProps<string>) {
  const { controls } = useAnimationWrapperContext();
  const variants = useVariants(animations);

  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      color="currentColor"
      {...props}
      role={ariaLabel ? "img" : "presentation"}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
    >
      <motion.g
        variants={variants.group}
        initial="initial"
        animate={controls}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      >
        <motion.path
          d="M18 16 l1.84 1.586 c0.773 0.667 1.16 1 1.16 1.414 s-0.387 0.747 -1.16 1.414 L18 22"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
          variants={variants.path1}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M14 16 l-1.84 1.586 c-0.773 0.667 -1.16 1 -1.16 1.414 s0.387 0.747 1.16 1.414 L14 22"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
          variants={variants.path2}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M20 13.003V7.82c0-1.694 0-2.54-.268-3.217c-.43-1.087-1.342-1.945-2.497-2.35C16.517 2 15.617 2 13.818 2c-3.148 0-4.722 0-5.98.441c-2.02.71-3.615 2.211-4.37 4.114C3 7.74 3 9.221 3 12.185v2.546c0 3.07 0 4.605.848 5.672c.243.305.53.576.855.805c.912.643 2.147.768 4.297.792"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
          variants={variants.path3}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M3 12a3.333 3.333 0 0 1 3.333-3.333c.666 0 1.451.116 2.098-.057A1.67 1.67 0 0 0 9.61 7.43c.173-.647.057-1.432.057-2.098A3.333 3.333 0 0 1 13 2"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
          variants={variants.path4}
          initial="initial"
          animate={controls}
        />
      </motion.g>
    </motion.svg>
  );
}

function DocumentCode(props: DocumentCodeProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  DocumentCode as Documentations,
  type DocumentCodeProps as DocumentationsProps,
};
