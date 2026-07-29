package com.braingames.arcade;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

/**
 * When kiosk mode is on, come back up automatically after a reboot so the
 * tablet/TV never sits on someone else's home screen.
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            SharedPreferences prefs = context.getSharedPreferences("braingames", Context.MODE_PRIVATE);
            if (!prefs.getBoolean("kioskEnabled", false)) return;
            Intent launch = new Intent(context, MainActivity.class);
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(launch);
        } catch (Exception ignored) {
        }
    }
}
