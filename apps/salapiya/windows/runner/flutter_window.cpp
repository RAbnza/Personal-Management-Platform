#include "flutter_window.h"

#include <optional>
#include <winrt/Windows.UI.Notifications.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Data.Xml.Dom.h>
#include <appmodel.h>
#include <shlobj.h>
#include <propkey.h>
#include <propvarutil.h>
#include <wrl/client.h>

namespace {
constexpr wchar_t kReminderAppId[] = L"Salapiya.Private.Development";
constexpr wchar_t kReminderGuid[] = L"{a64517d4-7ea1-49e7-bad5-c3d00db31c1d}";
constexpr wchar_t kReminderGroup[] = L"SalapiyaPrivate";
void RegisterDevelopmentNotifications() {
  UINT32 length = 0;
  if (GetCurrentPackageFullName(&length, nullptr) != APPMODEL_ERROR_NO_PACKAGE) return;
  winrt::check_hresult(SetCurrentProcessExplicitAppUserModelID(kReminderAppId));
  wchar_t executable[MAX_PATH];
  const auto count = GetModuleFileNameW(nullptr, executable, MAX_PATH);
  if (count == 0 || count == MAX_PATH) winrt::throw_last_error();
  PWSTR programs = nullptr;
  winrt::check_hresult(SHGetKnownFolderPath(FOLDERID_Programs, KF_FLAG_CREATE, nullptr, &programs));
  const std::wstring shortcut = std::wstring(programs) + L"\\Salapiya.Private.Development.lnk";
  CoTaskMemFree(programs);
  Microsoft::WRL::ComPtr<IShellLinkW> link;
  winrt::check_hresult(CoCreateInstance(CLSID_ShellLink, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&link)));
  winrt::check_hresult(link->SetPath(executable));
  winrt::check_hresult(link->SetDescription(L"Salapiya development application"));
  Microsoft::WRL::ComPtr<IPropertyStore> properties;
  winrt::check_hresult(link.As(&properties));
  PROPVARIANT app_id;
  winrt::check_hresult(InitPropVariantFromString(kReminderAppId, &app_id));
  const auto app_result = properties->SetValue(PKEY_AppUserModel_ID, app_id);
  PropVariantClear(&app_id); winrt::check_hresult(app_result);
  CLSID activator;
  winrt::check_hresult(CLSIDFromString(kReminderGuid, &activator));
  PROPVARIANT activation;
  winrt::check_hresult(InitPropVariantFromCLSID(activator, &activation));
  const auto activation_result = properties->SetValue(PKEY_AppUserModel_ToastActivatorCLSID, activation);
  PropVariantClear(&activation); winrt::check_hresult(activation_result);
  winrt::check_hresult(properties->Commit());
  Microsoft::WRL::ComPtr<IPersistFile> persist;
  winrt::check_hresult(link.As(&persist));
  winrt::check_hresult(persist->Save(shortcut.c_str(), TRUE));
  // Narrow per-user development identity/COM registration. The maintained
  // plugin remains responsible for delivery, schedules and activation callbacks.
  const std::wstring key_path = std::wstring(L"Software\\Classes\\CLSID\\") + kReminderGuid + L"\\LocalServer32";
  HKEY server = nullptr;
  winrt::check_win32(RegCreateKeyExW(HKEY_CURRENT_USER, key_path.c_str(), 0, nullptr, 0, KEY_SET_VALUE, nullptr, &server, nullptr));
  const std::wstring command = std::wstring(L"\"") + executable + L"\" -ToastActivated";
  const auto registry_result = RegSetValueExW(server, nullptr, 0, REG_SZ,
      reinterpret_cast<const BYTE*>(command.c_str()), static_cast<DWORD>((command.size()+1)*sizeof(wchar_t)));
  RegCloseKey(server); winrt::check_win32(registry_result);
}
}  // namespace

#include "flutter/generated_plugin_registrant.h"

FlutterWindow::FlutterWindow(const flutter::DartProject& project)
    : project_(project) {}

FlutterWindow::~FlutterWindow() {}

bool FlutterWindow::OnCreate() {
  if (!Win32Window::OnCreate()) {
    return false;
  }

  RECT frame = GetClientArea();

  // The size here must match the window dimensions to avoid unnecessary surface
  // creation / destruction in the startup path.
  flutter_controller_ = std::make_unique<flutter::FlutterViewController>(
      frame.right - frame.left, frame.bottom - frame.top, project_);
  // Ensure that basic setup of the controller was successful.
  if (!flutter_controller_->engine() || !flutter_controller_->view()) {
    return false;
  }
  RegisterPlugins(flutter_controller_->engine());
  window_chrome_ = std::make_unique<flutter::MethodChannel<flutter::EncodableValue>>(
      flutter_controller_->engine()->messenger(), "dev.salapiya/window_chrome",
      &flutter::StandardMethodCodec::GetInstance());
  window_chrome_->SetMethodCallHandler([this](const auto& call, auto result) {
    if (call.method_name() != "theme") { result->NotImplemented(); return; }
    const auto args = call.arguments() ? std::get_if<flutter::EncodableList>(call.arguments()) : nullptr;
    if (!args || args->size() != 4 || !std::holds_alternative<bool>((*args)[0])) {
      result->Error("invalid_theme", "Expected caption theme colors."); return;
    }
    COLORREF colors[3];
    for (size_t i = 1; i < 4; ++i) {
      const auto value = std::get_if<int32_t>(&(*args)[i]);
      if (!value || *value < 0 || *value > 0xFFFFFF) {
        result->Error("invalid_color", "Expected an RGB color."); return;
      }
      colors[i-1] = RGB((*value >> 16) & 255, (*value >> 8) & 255, *value & 255);
    }
    result->Success(flutter::EncodableValue(
        SetCaptionTheme(std::get<bool>((*args)[0]), colors[0], colors[1], colors[2])));
  });
  // Narrow permission-status/lifecycle adapter. The maintained notification
  // plugin owns registration, scheduling, cancellation and activation.
  notification_status_ = std::make_unique<flutter::MethodChannel<flutter::EncodableValue>>(
      flutter_controller_->engine()->messenger(),
      "dev.salapiya/native_notification_status", &flutter::StandardMethodCodec::GetInstance());
  notification_status_->SetMethodCallHandler([](const auto& call, auto result) {
    if (call.method_name() == "registerDevelopmentIdentity") {
      try { RegisterDevelopmentNotifications(); result->Success(); }
      catch (const winrt::hresult_error& error) { result->Error("registration_unavailable", winrt::to_string(error.message())); }
      return;
    }
    if (call.method_name() == "presentedIds") {
      try {
        flutter::EncodableList ids;
        for (const auto& toast : winrt::Windows::UI::Notifications::ToastNotificationManager::History().GetHistory(kReminderAppId)) {
          const auto tag = winrt::to_string(toast.Tag());
          if (!tag.empty() && tag.find_first_not_of("0123456789") == std::string::npos)
            ids.emplace_back(static_cast<int32_t>(std::stol(tag)));
        }
        result->Success(flutter::EncodableValue(ids));
      } catch (const winrt::hresult_error& error) { result->Error("history_unavailable", winrt::to_string(error.message())); }
      return;
    }
    if (call.method_name() == "showConfirmation") {
      try {
        winrt::Windows::Data::Xml::Dom::XmlDocument xml;
        xml.LoadXml(L"<toast><visual><binding template='ToastGeneric'><text>Salapiya reminder</text><text>Private device notification check. Open Salapiya to review.</text></binding></visual></toast>");
        winrt::Windows::UI::Notifications::ToastNotification toast(xml);
        toast.Tag(L"999"); toast.Group(kReminderGroup);
        winrt::Windows::UI::Notifications::ToastNotificationManager::CreateToastNotifier(kReminderAppId).Show(toast);
        result->Success();
      } catch (const winrt::hresult_error& error) { result->Error("confirmation_unavailable", winrt::to_string(error.message())); }
      return;
    }
    if (call.method_name() == "groupScheduled") {
      const auto id = call.arguments() ? std::get_if<int32_t>(call.arguments()) : nullptr;
      if (!id || *id < 0) { result->Error("invalid_id", "An owned scheduled identifier is required."); return; }
      try {
        const auto notifier = winrt::Windows::UI::Notifications::ToastNotificationManager::CreateToastNotifier(kReminderAppId);
        const winrt::hstring tag(std::to_wstring(*id));
        for (const auto& toast : notifier.GetScheduledToastNotifications()) {
          if (toast.Tag() == tag && toast.Group() != kReminderGroup) {
            // Win32 history removal requires a nonempty group. The maintained
            // plugin exposes tags only; preserve its exact payload/deadline.
            notifier.RemoveFromSchedule(toast);
            toast.Group(kReminderGroup);
            notifier.AddToSchedule(toast);
            break;
          }
        }
        result->Success();
      } catch (const winrt::hresult_error& error) { result->Error("grouping_unavailable", winrt::to_string(error.message())); }
      return;
    }
    if (call.method_name() == "cancelPresented") {
      int64_t id = -1;
      if (call.arguments()) {
        if (const auto int32Value = std::get_if<int32_t>(call.arguments())) id = *int32Value;
        else if (const auto int64Value = std::get_if<int64_t>(call.arguments())) id = *int64Value;
      }
      if (id < 0 || id > 2147483647) { result->Error("invalid_id", "An owned notification identifier is required."); return; }
      try {
        const auto history = winrt::Windows::UI::Notifications::ToastNotificationManager::History();
        const winrt::hstring tag(std::to_wstring(id));
        // A pending toast has already been removed by the maintained plugin.
        // Only invoke the shown-toast API when this exact owned tag exists.
        for (const auto& toast : history.GetHistory(kReminderAppId)) {
          if (toast.Tag() == tag) {
            if (toast.Group().empty()) {
              // Older development primers predate grouped delivery. They have
              // no source payload and cannot block cancellation of real sources.
              if (id == 999) continue;
              result->Error("cancellation_unavailable", "This legacy ungrouped development toast must be dismissed in Windows.");
              return;
            } else history.Remove(tag, toast.Group(), kReminderAppId);
          }
        }
        result->Success();
      } catch (const winrt::hresult_error& error) {
        if (error.code() == HRESULT_FROM_WIN32(ERROR_NOT_FOUND)) result->Success();
        else result->Error("cancellation_unavailable", winrt::to_string(error.message()), flutter::EncodableValue(static_cast<int32_t>(error.code().value)));
      }
      return;
    }
    if (call.method_name() != "windowsSetting") { result->NotImplemented(); return; }
    try {
      auto notifier = winrt::Windows::UI::Notifications::ToastNotificationManager::CreateToastNotifier(
          L"Salapiya.Private.Development");
      result->Success(flutter::EncodableValue(static_cast<int32_t>(notifier.Setting())));
    } catch (const winrt::hresult_error& error) {
      result->Error("status_unavailable", winrt::to_string(error.message()), flutter::EncodableValue(static_cast<int32_t>(error.code().value)));
    }
  });
  SetChildContent(flutter_controller_->view()->GetNativeWindow());

  flutter_controller_->engine()->SetNextFrameCallback([&]() {
    this->Show();
  });

  // Flutter can complete the first frame before the "show window" callback is
  // registered. The following call ensures a frame is pending to ensure the
  // window is shown. It is a no-op if the first frame hasn't completed yet.
  flutter_controller_->ForceRedraw();

  return true;
}

void FlutterWindow::OnDestroy() {
  window_chrome_ = nullptr;
  notification_status_ = nullptr;
  if (flutter_controller_) {
    flutter_controller_ = nullptr;
  }

  Win32Window::OnDestroy();
}

LRESULT
FlutterWindow::MessageHandler(HWND hwnd, UINT const message,
                              WPARAM const wparam,
                              LPARAM const lparam) noexcept {
  // Give Flutter, including plugins, an opportunity to handle window messages.
  if (flutter_controller_) {
    std::optional<LRESULT> result =
        flutter_controller_->HandleTopLevelWindowProc(hwnd, message, wparam,
                                                      lparam);
    if (result) {
      return *result;
    }
  }

  switch (message) {
    case WM_TIMECHANGE:
    case WM_POWERBROADCAST:
      if (notification_status_) notification_status_->InvokeMethod("clockChanged", nullptr);
      break;
    case WM_FONTCHANGE:
      flutter_controller_->engine()->ReloadSystemFonts();
      break;
  }

  return Win32Window::MessageHandler(hwnd, message, wparam, lparam);
}
