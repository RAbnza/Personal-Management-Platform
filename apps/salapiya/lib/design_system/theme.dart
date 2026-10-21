import 'package:flutter/material.dart';

abstract final class Space {
  static const double xs = 4, sm = 8, md = 12, lg = 16, xl = 24, xxl = 32;
  static const double target = 48, cardRadius = 20, controlRadius = 12;
}

abstract final class Palette {
  static const porcelain = Color(0xFFF7F8FC), midnight = Color(0xFF0D1020);
  static const violet = Color(0xFF6B469C), lavender = Color(0xFFC8B6F2);
  static const white = Color(0xFFFFFFFF);
}

enum NoticeTone { neutral, information, success, warning, error }

@immutable
class CraftTheme extends ThemeExtension<CraftTheme> {
  const CraftTheme({required this.dark});
  final bool dark;
  Color get surface => dark ? const Color(0xFF171B31) : Palette.white;
  Color get raised => dark ? const Color(0xFF20253F) : Palette.white;
  Color get subtle => dark ? const Color(0xFF202440) : const Color(0xFFEEF0F8);
  Color get text => dark ? const Color(0xFFF3F5FF) : const Color(0xFF22252B);
  Color get secondary =>
      dark ? const Color(0xFFB7C2DE) : const Color(0xFF5E6570);
  Color get border => dark ? const Color(0xFF929CBA) : const Color(0xFF7A8197);
  Color get divider => dark ? const Color(0xFF363D5B) : const Color(0xFFDCE0EC);
  Color get primary => dark ? Palette.lavender : Palette.violet;
  Color get onPrimary => dark ? const Color(0xFF1B1B22) : Palette.white;
  Color get hover => dark ? const Color(0xFFBCA5EE) : const Color(0xFF5D3D88);
  Color get pressed => dark ? const Color(0xFFB09AE0) : const Color(0xFF503474);
  Color get selection =>
      dark ? const Color(0xFF332A45) : const Color(0xFFEEEAF5);
  Color get warm => dark ? const Color(0xFFD9BE97) : const Color(0xFF82603A);
  Color get warmSurface =>
      dark ? const Color(0xFF30291F) : const Color(0xFFF5EEE5);
  Color get plum => dark ? const Color(0xFFF3B6EF) : const Color(0xFF80456F);
  Color get plumSurface =>
      dark ? const Color(0xFF38203F) : const Color(0xFFF4E5EE);
  Color get blue => dark ? const Color(0xFF8BDCFF) : const Color(0xFF245E87);
  Color get blueSurface =>
      dark ? const Color(0xFF132C45) : const Color(0xFFE5F1FA);
  Color get focalStart =>
      dark ? const Color(0xFF302153) : const Color(0xFFEEE8FF);
  Color get focalEnd =>
      dark ? const Color(0xFF142C49) : const Color(0xFFE1EFFF);
  (Color, Color) tone(NoticeTone tone) => switch (tone) {
    NoticeTone.neutral => (secondary, subtle),
    NoticeTone.information =>
      dark
          ? (const Color(0xFF9AC5FF), const Color(0xFF19283B))
          : (const Color(0xFF235EA7), const Color(0xFFEDF4FF)),
    NoticeTone.success =>
      dark
          ? (const Color(0xFF75D5A5), const Color(0xFF142B22))
          : (const Color(0xFF146C43), const Color(0xFFEDF8F1)),
    NoticeTone.warning =>
      dark
          ? (const Color(0xFFF3C16B), const Color(0xFF312716))
          : (const Color(0xFF8A4B0F), const Color(0xFFFFF4DF)),
    NoticeTone.error =>
      dark
          ? (const Color(0xFFFDA29B), const Color(0xFF371D22))
          : (const Color(0xFFB42318), const Color(0xFFFFF0ED)),
  };
  List<BoxShadow> get shadow => [
    BoxShadow(
      color: Colors.black.withValues(alpha: dark ? .20 : .08),
      offset: const Offset(0, 4),
      blurRadius: 16,
    ),
  ];
  static CraftTheme of(BuildContext context) =>
      Theme.of(context).extension<CraftTheme>()!;
  @override
  CraftTheme copyWith({bool? dark}) => CraftTheme(dark: dark ?? this.dark);
  @override
  CraftTheme lerp(covariant CraftTheme? other, double t) =>
      t < .5 ? this : other ?? this;
}

class CraftPreferences extends InheritedWidget {
  const CraftPreferences({
    super.key,
    required this.effects,
    required super.child,
  });
  final bool effects;
  static bool effectsOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<CraftPreferences>()?.effects ??
      true;
  @override
  bool updateShouldNotify(CraftPreferences oldWidget) =>
      effects != oldWidget.effects;
}

abstract final class SalapiyaTheme {
  static ThemeData build(Brightness brightness) {
    final c = CraftTheme(dark: brightness == Brightness.dark);
    TextStyle type(double size, FontWeight weight, double height) => TextStyle(
      fontFamily: 'Nunito Sans',
      fontSize: size,
      fontWeight: weight,
      height: height,
      color: c.text,
    );
    final outline = OutlineInputBorder(
      borderRadius: BorderRadius.circular(Space.controlRadius),
      borderSide: BorderSide(color: c.border),
    );
    final scheme =
        ColorScheme.fromSeed(
          seedColor: Palette.violet,
          brightness: brightness,
        ).copyWith(
          primary: c.primary,
          onPrimary: c.onPrimary,
          surface: c.surface,
          onSurface: c.text,
          onSurfaceVariant: c.secondary,
          surfaceContainerHighest: c.subtle,
          outline: c.border,
          outlineVariant: c.divider,
          error: c.tone(NoticeTone.error).$1,
        );
    ButtonStyle button({bool filled = false}) => ButtonStyle(
      minimumSize: const WidgetStatePropertyAll(Size(48, 48)),
      padding: const WidgetStatePropertyAll(
        EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      ),
      shape: WidgetStatePropertyAll(
        RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      textStyle: WidgetStatePropertyAll(type(14, FontWeight.w700, 1.4)),
      foregroundColor: WidgetStateProperty.resolveWith(
        (s) => s.contains(WidgetState.disabled)
            ? c.secondary
            : filled
            ? c.onPrimary
            : c.primary,
      ),
      backgroundColor: WidgetStateProperty.resolveWith(
        (s) => s.contains(WidgetState.disabled)
            ? c.subtle
            : !filled
            ? null
            : s.contains(WidgetState.pressed)
            ? c.pressed
            : s.contains(WidgetState.hovered)
            ? c.hover
            : c.primary,
      ),
      side: WidgetStateProperty.resolveWith(
        (s) => s.contains(WidgetState.focused)
            ? BorderSide(color: filled ? c.onPrimary : c.primary, width: 3)
            : null,
      ),
    );
    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: c.dark ? Palette.midnight : Palette.porcelain,
      fontFamily: 'Nunito Sans',
      extensions: [c],
      textTheme: TextTheme(
        displaySmall: type(32, FontWeight.w600, 1.2),
        headlineMedium: type(26, FontWeight.w700, 1.25),
        titleLarge: type(20, FontWeight.w600, 1.3),
        titleMedium: type(16, FontWeight.w700, 1.4),
        bodyLarge: type(16, FontWeight.w400, 1.5),
        bodyMedium: type(14, FontWeight.w400, 1.45),
        bodySmall: type(14, FontWeight.w400, 1.45),
        labelLarge: type(14, FontWeight.w600, 1.4),
      ),
      filledButtonTheme: FilledButtonThemeData(style: button(filled: true)),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: button().copyWith(
          side: WidgetStateProperty.resolveWith(
            (s) => BorderSide(
              color: s.contains(WidgetState.focused) ? c.primary : c.border,
              width: s.contains(WidgetState.focused) ? 3 : 1,
            ),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(style: button()),
      iconButtonTheme: IconButtonThemeData(
        style: ButtonStyle(
          minimumSize: const WidgetStatePropertyAll(Size(48, 48)),
          foregroundColor: WidgetStatePropertyAll(c.primary),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: c.surface,
        border: outline,
        enabledBorder: outline,
        focusedBorder: outline.copyWith(
          borderSide: BorderSide(color: c.primary, width: 2),
        ),
        errorBorder: outline.copyWith(
          borderSide: BorderSide(color: scheme.error),
        ),
        focusedErrorBorder: outline.copyWith(
          borderSide: BorderSide(color: scheme.error, width: 2),
        ),
        floatingLabelBehavior: FloatingLabelBehavior.always,
        contentPadding: const EdgeInsets.all(16),
        helperMaxLines: 4,
        errorMaxLines: 4,
      ),
      dividerTheme: DividerThemeData(color: c.divider, space: 24),
      appBarTheme: AppBarTheme(
        backgroundColor: c.surface,
        foregroundColor: c.text,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: c.raised,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: c.raised,
        showDragHandle: true,
        surfaceTintColor: Colors.transparent,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: c.text,
        contentTextStyle: TextStyle(
          color: c.surface,
          fontFamily: 'Nunito Sans',
        ),
      ),
    );
  }
}
