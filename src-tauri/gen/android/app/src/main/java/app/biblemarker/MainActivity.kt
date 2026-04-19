package app.biblemarker

import android.graphics.Color
import android.os.Bundle
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT)
    )
    super.onCreate(savedInstanceState)
  }

  override fun onActionModeStarted(mode: android.view.ActionMode?) {
    // Immediately dismiss the system text-selection toolbar so our custom
    // BibleMarker marking menu (driven by JS handleMouseUp) can take over.
    mode?.finish()
    super.onActionModeStarted(mode)
  }
}
