import React from 'react';
import { Pressable, Text, View } from 'react-native';

interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

interface Props<T extends string> {
  title: string;
  options: Option<T>[];
  selected: T;
  onSelect: (value: T) => void;
}

export function OptionSelector<T extends string>({ title, options, selected, onSelect }: Props<T>) {
  return (
    <View className="mb-6">
      <Text className="text-base font-semibold text-brick-dark mb-2">{title}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((o) => {
          const active = o.value === selected;
          return (
            <Pressable
              key={o.value}
              onPress={() => onSelect(o.value)}
              className={
                active
                  ? 'px-4 py-2.5 rounded-xl bg-brick-dark'
                  : 'px-4 py-2.5 rounded-xl bg-white border border-gray-200'
              }
            >
              <Text className={active ? 'text-white font-semibold' : 'text-brick-dark'}>
                {o.label}
              </Text>
              {o.hint ? (
                <Text className={active ? 'text-gray-300 text-xs' : 'text-gray-400 text-xs'}>
                  {o.hint}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
