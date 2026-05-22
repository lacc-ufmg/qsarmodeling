import { ActionIcon } from "@mantine/core";
import { IconMoon, IconSun } from "@tabler/icons-react";

type ColorSchemeToggleProps = {
  onToggle: () => void;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
};

export function ColorSchemeToggle({ onToggle, size = "lg" }: ColorSchemeToggleProps) {
  return (
    <ActionIcon
      onClick={onToggle}
      variant="default"
      size={size}
      aria-label="Toggle color scheme"
    >
      <IconSun className="mantine-light-hidden" stroke={1.5} />
      <IconMoon className="mantine-dark-hidden" stroke={1.5} />
    </ActionIcon>
  );
}
