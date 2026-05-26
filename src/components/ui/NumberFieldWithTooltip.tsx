import { Group, NumberInput } from "@mantine/core";
import { HelpTooltip } from "./HelpTooltip";

type NumberFieldWithTooltipProps = {
  label: string;
  help: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
};

export function NumberFieldWithTooltip({
  label,
  help,
  value,
  min,
  max,
  step,
  onChange,
}: NumberFieldWithTooltipProps) {
  return (
    <NumberInput
      label={
        <Group gap="xs">
          {label}
          <HelpTooltip text={help} />
        </Group>
      }
      value={value}
      min={min}
      max={max}
      step={step}
      decimalScale={2}
      fixedDecimalScale
      allowedDecimalSeparators={[".", ","]}
      onChange={(val) => onChange(Number(val) || 0)}
    />
  );
}
