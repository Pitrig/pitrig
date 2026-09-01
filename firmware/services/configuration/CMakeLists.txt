idf_component_register(
  SRCS "src/configuration_json.cpp"
       "src/json_hardware.cpp"
       "src/json_led_effect.cpp"
       "src/json_readers.cpp"
       "src/json_value_pipeline.cpp"
       "src/json_widgets.cpp"
       "src/json_widget_gauges.cpp"
       "src/json_widget_variants.cpp"
       "src/configuration_validation.cpp"
       "src/validation/document_rules.cpp"
       "src/validation/hardware_rules.cpp"
       "src/validation/led_effect_rules.cpp"
       "src/validation/value_rules.cpp"
       "src/validation/widget_validator.cpp"
       "src/validation/widget_validator_types.cpp"
       "src/configuration_service.cpp"
  INCLUDE_DIRS "include"
  PRIV_INCLUDE_DIRS "src"
  REQUIRES configuration_contract font_contract image_contract
  PRIV_REQUIRES binary cjson heap telemetry)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
