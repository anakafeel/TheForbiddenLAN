import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

export interface DataColumn<T> {
  key: string;
  title: string;
  width?: number;
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  compact?: boolean;
}

export function DataTable<T>({ columns, rows, rowKey, compact = true }: DataTableProps<T>) {
  return (
    <View style={styles.wrapper}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={styles.inner}>
          <View style={styles.headerRow}>
            {columns.map((column) => (
              <View key={column.key} style={[styles.cell, styles.headerCell, { width: column.width ?? 160 }]}>
                <Text style={styles.headerText}>{column.title}</Text>
              </View>
            ))}
          </View>

          {rows.map((row, index) => (
            <View key={rowKey(row)} style={[styles.dataRow, index % 2 === 1 && styles.altRow]}>
              {columns.map((column) => (
                <View
                  key={column.key}
                  style={[
                    styles.cell,
                    { width: column.width ?? 160, minHeight: compact ? theme.layout.rowHeight : 48 },
                  ]}
                >
                  {column.render(row)}
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.layout.cardRadius,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
  },
  inner: {
    minWidth: 900,
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceMuted,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  altRow: {
    backgroundColor: '#111a26',
  },
  cell: {
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  headerCell: {
    minHeight: 36,
  },
  headerText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
