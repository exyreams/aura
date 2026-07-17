import { motion, type Variants } from "motion/react";
import {
  type IconProps,
  IconWrapper,
  useAnimationWrapperContext,
  useVariants,
} from "./utils/AnimationWrapper";

type ChatBotProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    group: {
      initial: {
        rotate: 0,
        scale: 1,
      },
      animate: {
        scale: [0.92, 1.03, 1],
        transition: {
          duration: 0.93,
          ease: [0.34, 1.56, 0.64, 1],
        },
      },
    },
    speechBubble: {
      initial: {
        pathLength: 1,
        opacity: 1,
        x: 0,
        y: 0,
      },
      animate: {
        opacity: [0.3, 1],
        x: [4.31, 0],
        y: [-10.33, 0],
        transition: {
          duration: 0.59,
          ease: [0.34, 1.56, 0.64, 1],
          delay: 0,
        },
      },
    },
    speechBubbleOutline: {
      initial: {
        pathLength: 1,
        opacity: 1,
        x: 0,
        y: 0,
      },
      animate: {
        opacity: [0.3, 1],
        x: [10.33, 0],
        y: [0, 0],
        transition: {
          duration: 0.54,
          ease: [0.34, 1.56, 0.64, 1],
          delay: 0.05,
        },
      },
    },
    leftBubbleTip: {
      initial: {
        pathLength: 1,
        opacity: 1,
        x: 0,
        y: 0,
      },
      animate: {
        opacity: [0.3, 1],
        x: [-10.33, 0],
        y: [0, 0],
        transition: {
          duration: 0.54,
          ease: [0.34, 1.56, 0.64, 1],
          delay: 0.09,
        },
      },
    },
    rightBubbleTip: {
      initial: {
        pathLength: 1,
        opacity: 1,
        x: 0,
        y: 0,
      },
      animate: {
        opacity: [0.3, 1],
        x: [5.35, 0],
        y: [9.17, 0],
        transition: {
          duration: 0.51,
          ease: [0.34, 1.56, 0.64, 1],
          delay: 0.13,
        },
      },
    },
    head: {
      initial: {
        pathLength: 1,
        opacity: 1,
        x: 0,
        y: 0,
      },
      animate: {
        opacity: [0.3, 1],
        x: [-5.23, 0],
        y: [8.96, 0],
        transition: {
          duration: 0.5,
          ease: [0.34, 1.56, 0.64, 1],
          delay: 0.17,
        },
      },
    },
    mouthLine: {
      initial: {
        pathLength: 1,
        opacity: 1,
        x: 0,
        y: 0,
      },
      animate: {
        opacity: [0.3, 1],
        x: [-5.23, 0],
        y: [8.96, 0],
        transition: {
          duration: 0.5,
          ease: [0.34, 1.56, 0.64, 1],
          delay: 0.2,
        },
      },
    },
    leftEye: {
      initial: {
        pathLength: 1,
        opacity: 1,
        x: 0,
        y: 0,
      },
      animate: {
        opacity: [0.3, 1],
        x: [-5, 0],
        y: [8.57, 0],
        transition: {
          duration: 0.49,
          ease: [0.34, 1.56, 0.64, 1],
          delay: 0.26,
        },
      },
    },
    rightEye: {
      initial: {
        pathLength: 1,
        opacity: 1,
        x: 0,
        y: 0,
      },
      animate: {
        opacity: [0.3, 1],
        x: [-5, 0],
        y: [8.57, 0],
        transition: {
          duration: 0.49,
          ease: [0.34, 1.56, 0.64, 1],
          delay: 0.23,
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
          d="M11 8 h2 c2.828 0 4.243 0 5.121 0.879 C19 9.757 19 11.172 19 14 s0 4.243 -0.879 5.121 C17.243 20 15.828 20 13 20 h-1 s-0.5 2 -4 2 c0 0 1 -1.009 1 -2.017 c-1.553 -0.047 -2.48 -0.22 -3.121 -0.862 C5 18.243 5 16.828 5 14 s0 -4.243 0.879 -5.121 C6.757 8 8.172 8 11 8 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          variants={variants.speechBubble}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M19 11.5 h0.5 c0.935 0 1.402 0 1.75 0.201 a1.5 1.5 0 0 1 0.549 0.549 c0.201 0.348 0.201 0.815 0.201 1.75 s0 1.402 -0.201 1.75 a1.5 1.5 0 0 1 -0.549 0.549 c-0.348 0.201 -0.815 0.201 -1.75 0.201 H19"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          variants={variants.speechBubbleOutline}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M5 11.5 h-0.5 c-0.935 0 -1.402 0 -1.75 0.201 a1.5 1.5 0 0 0 -0.549 0.549 C2 12.598 2 13.065 2 14 s0 1.402 0.201 1.75 a1.5 1.5 0 0 0 0.549 0.549 c0.348 0.201 0.815 0.201 1.75 0.201 H5"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          variants={variants.leftBubbleTip}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M13.5 3.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0Z"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          variants={variants.rightBubbleTip}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M12 5 v3"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          variants={variants.head}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M9 12 v1"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          variants={variants.mouthLine}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M15 12 v1"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          variants={variants.leftEye}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M10 16.5s.667.5 2 .5s2-.5 2-.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          variants={variants.rightEye}
          initial="initial"
          animate={controls}
        />
      </motion.g>
    </motion.svg>
  );
}

function ChatBot(props: ChatBotProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export { animations, ChatBot as Agent, type ChatBotProps as AgentProps };
