package expo.modules.monivranative

import androidx.core.content.FileProvider

// A provider of its own, so it never clashes with the providers of other modules.
class MonivraPhotoProvider : FileProvider()
