package com.braingames.arcade;

import android.app.admin.DeviceAdminReceiver;
import android.content.ComponentName;
import android.content.Context;

/**
 * Device-admin hook for kiosk mode.
 *
 * Brain Arcade works as a kiosk without this (Android's screen pinning is
 * enough for most tablets). When the device is additionally provisioned as
 * device owner — e.g. on a fresh device:
 *     adb shell dpm set-device-owner com.braingames.arcade/.KioskDeviceAdminReceiver
 * the app can pin itself with no "swipe up to exit" escape hatch at all.
 */
public class KioskDeviceAdminReceiver extends DeviceAdminReceiver {

    public static ComponentName component(Context ctx) {
        return new ComponentName(ctx.getApplicationContext(), KioskDeviceAdminReceiver.class);
    }
}
